"""
Bank classifications and multi-dimensional hierarchy API routes.
Complies with AGENTS.md rules:
- No dynamic path params (/{id}), use query params (?id=... or ?bank_id=...) or request body.
"""
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/bank-categories", tags=["Bank Classifications"])


class SpaceItem(BaseModel):
    space_code: str
    name: str
    description: str = ""
    sort_order: int = 0
    is_active: str = "enabled"


class BankClassificationItem(BaseModel):
    bank_id: str
    space_code: str
    environment: str
    subject_type: str
    subject_id: str
    display_name: str
    tags: str = ""
    sort_order: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SaveClassificationRequest(BaseModel):
    bank_id: str = Field(..., description="Target bank id")
    space_code: str = Field(default="pet_health", description="Space code")
    environment: str = Field(default="test", description="Environment: dev/test/staging/prod")
    subject_type: str = Field(default="pet_profile", description="Subject type: pet_profile/user/agent/system")
    subject_id: str = Field(default="", description="Subject identifier e.g. 82")
    display_name: str = Field(..., description="Clean display name e.g. 小呱 · 档案82")
    tags: str = Field(default="", description="Comma separated tags")
    sort_order: int = Field(default=0, description="Sort order")


class BatchClassifyMapping(BaseModel):
    bank_id: str
    display_name: str
    subject_id: str = ""
    subject_type: str = "pet_profile"
    tags: str = ""


class BatchClassifyRequest(BaseModel):
    space_code: str = "pet_health"
    environment: str = "test"
    mappings: List[BatchClassifyMapping]


class DeleteClassificationRequest(BaseModel):
    bank_id: str = Field(..., description="Target bank id to delete from classifications")


async def _get_db_pool(request: Request):
    """Retrieve asyncpg pool from memory backend."""
    memory = getattr(request.app.state, "memory", None)
    if not memory:
        raise HTTPException(status_code=500, detail="Memory engine not initialized")
    pool = await memory._get_pool()
    if not pool:
        raise HTTPException(status_code=500, detail="Database pool not available")
    return pool


@router.get("/tree", summary="Get hierarchical classification tree")
async def get_classification_tree(
    request: Request,
    space_code: Optional[str] = Query(None, description="Optional filter by space_code"),
    environment: Optional[str] = Query(None, description="Optional filter by environment"),
    keyword: Optional[str] = Query(None, description="Optional search keyword for bank_id or display_name"),
):
    """
    Returns nested tree: Spaces -> Environments -> Banks, plus unclassified banks.
    """
    pool = await _get_db_pool(request)
    async with pool.acquire() as conn:
        # 1. Fetch spaces
        space_rows = await conn.fetch("SELECT space_code, name, description, sort_order FROM memory_spaces ORDER BY sort_order ASC, id ASC;")
        spaces_map = {
            r["space_code"]: {
                "space_code": r["space_code"],
                "space_name": r["name"],
                "description": r["description"],
                "environments": {}
            }
            for r in space_rows
        }

        # 2. Fetch all banks from banks table to count facts and find unclassified ones
        all_banks_rows = await conn.fetch("""
            SELECT b.bank_id, 
                   COALESCE(m.cnt, 0) as fact_count,
                   b.updated_at
            FROM banks b
            LEFT JOIN (
                SELECT bank_id, COUNT(*) as cnt FROM memory_units GROUP BY bank_id
            ) m ON b.bank_id = m.bank_id
            ORDER BY b.updated_at DESC;
        """)
        bank_stats = {r["bank_id"]: {"fact_count": r["fact_count"], "updated_at": str(r["updated_at"]) if r["updated_at"] else None} for r in all_banks_rows}

        # 3. Fetch classification records
        sql = "SELECT bank_id, space_code, environment, subject_type, subject_id, display_name, tags, sort_order, updated_at FROM bank_classifications WHERE 1=1"
        params = []
        if space_code:
            params.append(space_code)
            sql += f" AND space_code = ${len(params)}"
        if environment:
            params.append(environment)
            sql += f" AND environment = ${len(params)}"
        sql += " ORDER BY sort_order ASC, updated_at DESC;"

        class_rows = await conn.fetch(sql, *params)
        classified_bank_ids = set()

        for cr in class_rows:
            b_id = cr["bank_id"]
            classified_bank_ids.add(b_id)
            d_name = cr["display_name"]

            # Filter keyword if given
            if keyword:
                kw = keyword.lower()
                if kw not in b_id.lower() and kw not in d_name.lower():
                    continue

            s_code = cr["space_code"]
            env = cr["environment"]
            
            if s_code not in spaces_map:
                spaces_map[s_code] = {
                    "space_code": s_code,
                    "space_name": s_code,
                    "description": "",
                    "environments": {}
                }
            
            envs_dict = spaces_map[s_code]["environments"]
            if env not in envs_dict:
                env_names = {
                    "test": "测试环境",
                    "dev": "开发环境",
                    "staging": "预发环境",
                    "prod": "正式环境"
                }
                envs_dict[env] = {
                    "env_code": env,
                    "env_name": env_names.get(env, env),
                    "banks": []
                }
            
            stats = bank_stats.get(b_id, {"fact_count": 0, "updated_at": str(cr["updated_at"]) if cr["updated_at"] else None})
            envs_dict[env]["banks"].append({
                "bank_id": b_id,
                "display_name": d_name,
                "subject_type": cr["subject_type"],
                "subject_id": cr["subject_id"],
                "tags": cr["tags"],
                "sort_order": cr["sort_order"],
                "fact_count": stats["fact_count"],
                "updated_at": stats["updated_at"]
            })

        # 4. Find unclassified banks
        unclassified = []
        for b_id, b_data in bank_stats.items():
            if b_id not in classified_bank_ids:
                if keyword:
                    kw = keyword.lower()
                    if kw not in b_id.lower():
                        continue
                unclassified.append({
                    "bank_id": b_id,
                    "display_name": b_id,
                    "fact_count": b_data["fact_count"],
                    "updated_at": b_data["updated_at"]
                })

        # Format output
        spaces_result = []
        for s_code, s_info in spaces_map.items():
            env_list = []
            for e_code, e_info in s_info["environments"].items():
                env_list.append({
                    "env_code": e_code,
                    "env_name": e_info["env_name"],
                    "bank_count": len(e_info["banks"]),
                    "banks": e_info["banks"]
                })
            # Only include space if it has environments or if no filters
            if env_list or not (space_code or environment or keyword):
                spaces_result.append({
                    "space_code": s_info["space_code"],
                    "space_name": s_info["space_name"],
                    "description": s_info["description"],
                    "environments": env_list
                })

        return {
            "code": 0,
            "message": "success",
            "data": {
                "spaces": spaces_result,
                "unclassified_count": len(unclassified),
                "unclassified_banks": unclassified
            }
        }


@router.get("/detail", summary="Get bank classification detail")
async def get_classification_detail(
    request: Request,
    bank_id: str = Query(..., description="Target bank id (query parameter)"),
):
    """
    Get classification metadata for a specific bank_id.
    """
    pool = await _get_db_pool(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT bank_id, space_code, environment, subject_type, subject_id, display_name, tags, sort_order, created_at, updated_at
            FROM bank_classifications
            WHERE bank_id = $1;
        """, bank_id)
        if not row:
            return {
                "code": 0,
                "message": "not_classified",
                "data": None
            }
        return {
            "code": 0,
            "message": "success",
            "data": {
                "bank_id": row["bank_id"],
                "space_code": row["space_code"],
                "environment": row["environment"],
                "subject_type": row["subject_type"],
                "subject_id": row["subject_id"],
                "display_name": row["display_name"],
                "tags": row["tags"],
                "sort_order": row["sort_order"],
                "created_at": str(row["created_at"]),
                "updated_at": str(row["updated_at"])
            }
        }


@router.post("/update", summary="Update bank classification (alias for save)")
async def update_bank_classification(
    payload: SaveClassificationRequest,
    request: Request,
):
    return await save_classification(request, payload)


@router.post("/save", summary="Create or update bank classification")
async def save_classification(
    request: Request,
    payload: SaveClassificationRequest,
):
    """
    Save or update classification info for a bank. Uses request body.
    """
    pool = await _get_db_pool(request)
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO bank_classifications 
                (bank_id, space_code, environment, subject_type, subject_id, display_name, tags, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (bank_id) DO UPDATE SET
                space_code = EXCLUDED.space_code,
                environment = EXCLUDED.environment,
                subject_type = EXCLUDED.subject_type,
                subject_id = EXCLUDED.subject_id,
                display_name = EXCLUDED.display_name,
                tags = EXCLUDED.tags,
                sort_order = EXCLUDED.sort_order,
                updated_at = CURRENT_TIMESTAMP;
        """, payload.bank_id, payload.space_code, payload.environment, payload.subject_type, payload.subject_id, payload.display_name, payload.tags, payload.sort_order)

        return {
            "code": 0,
            "message": "saved_successfully",
            "data": {"bank_id": payload.bank_id}
        }


@router.post("/batch-classify", summary="Batch classify banks")
async def batch_classify(
    request: Request,
    payload: BatchClassifyRequest,
):
    """
    Batch classify multiple banks at once. Uses request body.
    """
    pool = await _get_db_pool(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            for item in payload.mappings:
                await conn.execute("""
                    INSERT INTO bank_classifications 
                        (bank_id, space_code, environment, subject_type, subject_id, display_name, tags)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (bank_id) DO UPDATE SET
                        space_code = EXCLUDED.space_code,
                        environment = EXCLUDED.environment,
                        subject_type = EXCLUDED.subject_type,
                        subject_id = EXCLUDED.subject_id,
                        display_name = EXCLUDED.display_name,
                        tags = EXCLUDED.tags,
                        updated_at = CURRENT_TIMESTAMP;
                """, item.bank_id, payload.space_code, payload.environment, item.subject_type, item.subject_id, item.display_name, item.tags)

        return {
            "code": 0,
            "message": "batch_classified_successfully",
            "data": {"count": len(payload.mappings)}
        }


@router.post("/delete", summary="Remove a bank classification")
async def delete_classification(
    request: Request,
    payload: DeleteClassificationRequest,
):
    """
    Remove classification metadata for a bank. Uses request body.
    """
    pool = await _get_db_pool(request)
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM bank_classifications WHERE bank_id = $1;", payload.bank_id)
        return {
            "code": 0,
            "message": "deleted_successfully",
            "data": {"bank_id": payload.bank_id, "result": result}
        }
