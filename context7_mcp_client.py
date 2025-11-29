import asyncio
import os
from contextlib import AsyncExitStack
from typing import Any, Dict, List

try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
except ImportError as exc:  # pragma: no cover - optional dependency
    raise RuntimeError(
        "The 'mcp' package is required to use context7 MCP client. "
        "Install it in a virtualenv, e.g.: python3 -m venv .venv && "
        ".venv/bin/python -m pip install mcp"
    ) from exc


async def _fetch_docs_via_mcp(
    library_id: str, topic: str, max_results: int
) -> List[Dict[str, str]]:
    command = os.environ.get("CONTEXT7_MCP_COMMAND", "npx").strip() or "npx"
    raw_args = os.environ.get("CONTEXT7_MCP_ARGS")
    if raw_args:
        args = raw_args.split()
    else:
        args = ["-y", "@upstash/context7-mcp"]

    env: Dict[str, str] = {}
    api_key = os.environ.get("CONTEXT7_API_KEY", "").strip()
    if api_key:
        env["CONTEXT7_API_KEY"] = api_key

    server_params = StdioServerParameters(command=command, args=args, env=env or None)

    async with AsyncExitStack() as stack:
        stdio = await stack.enter_async_context(stdio_client(server_params))
        read, write = stdio
        session = await stack.enter_async_context(ClientSession(read, write))

        await session.initialize()

        tool_args: Dict[str, Any] = {
            "context7CompatibleLibraryID": library_id,
            "topic": topic,
            "page": 1,
        }

        result = await session.call_tool("get-library-docs", tool_args)

        texts: List[str] = []
        for part in getattr(result, "content", []) or []:
            text = getattr(part, "text", None)
            if isinstance(text, str) and text.strip():
                texts.append(text.strip())

        if not texts:
            return []

        full = "\n\n".join(texts)
    if not full.strip():
        return []

    snippet = full.strip()
    return [
        {"file": library_id, "snippet": snippet, "source": "context7_mcp"},
    ][:max_results]


def search_mermaid_docs_via_mcp(
    query: str, max_results: int = 5
) -> List[Dict[str, str]]:
    library_id = os.environ.get("CONTEXT7_LIBRARY_ID", "/mermaid-js/mermaid").strip()
    if not library_id:
        return []

    trimmed = (query or "").strip()
    if not trimmed:
        return []

    topic = trimmed[:80]

    try:
        return asyncio.run(_fetch_docs_via_mcp(library_id, topic, max_results))
    except Exception:
        return []
