# Prompt Engineering & Context

[← Back to Index](./) | [← Prev: Mermaid Agent](ai-agent.md)

Generation quality comes from a structured prompt-building pipeline.

## Prompt pipeline

1. **Intent injection**: take the latest Intent from chat history.
2. **Context selection**: load Mermaid docs relevant to the selected diagram type.
3. **Code context**: include current code as `current_state`.
4. **System instructions**: apply mode-specific instructions (Generate/Fix/Analyze).

## Documentation controls (Build Docs)
In **Build Docs**, you can manually control context by toggling documentation files on/off.

## Auto-fix loop
If code is invalid, the app runs an auto-fix loop by sending parser errors back to the model (up to 5 attempts).

---
[← Back to Index](./)
