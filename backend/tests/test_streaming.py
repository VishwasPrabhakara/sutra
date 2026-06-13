import json

from main import format_sse_event


def test_format_sse_event():
    rendered = format_sse_event(
        "tool_result",
        {"event": "tool_result", "data": {"count": 2}},
    )

    lines = rendered.strip().splitlines()
    assert lines[0] == "event: tool_result"
    assert json.loads(lines[1].removeprefix("data: ")) == {
        "event": "tool_result",
        "data": {"count": 2},
    }
