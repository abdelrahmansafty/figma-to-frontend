# Figma Without Limit (Claude Code Skill)

ابعت لينك فيجما لـ Claude Code وقوله **"اعمل الفرونت"**، وهو:
1. يقرا الديزاين عن طريق بلجن على جهازك ([Figma MCP Bridge](https://github.com/gethopp/figma-mcp-bridge))، فمفيش حد لعدد الطلبات، وبيشتغل حتى لو معاك View بس.
2. يدوّر على الكومبوننتس الموجودة في البروجكت ويستخدمها بدل ما يبنيها من الأول.
3. يبني الصفحة بكل حالاتها.
4. يقارن النتيجة بالديزاين ويصلّح لحد ما تطابقه.

## التسطيب

### 1) حط الـ Skill (مرة واحدة)
```bash
mkdir -p ~/.claude/skills/figma-without-limit && curl -fsSL https://raw.githubusercontent.com/abdelrahmansafty/figma-to-frontend/main/SKILL.md -o ~/.claude/skills/figma-without-limit/SKILL.md
```
أو نزّل [SKILL.md](SKILL.md) وحطه في `~/.claude/skills/figma-without-limit/SKILL.md`.

### 2) أول مرة تبعت فيها لينك فيجما
الـ Skill هتلاحظ إن البلجن مش متسطب وتسألك. لو وافقت، هتعمل لوحدها:
- تتأكد إن Node.js موجود (18 أو أحدث).
- تسطّب سيرفر `figma-bridge` في Claude Code.
- تنزّل بلجن فيجما في `~/figma-mcp-bridge` وتفتحلك ملفه.

وبعدين فاضل عليك خطوتين:
1. **اقفل Claude Code وافتحه تاني.**
2. في **Figma Desktop**: **Plugins → Development → Import plugin from manifest** → اختار `~/figma-mcp-bridge/plugin/manifest.json`.

### 3) كل مرة
1. افتح الديزاين في **Figma Desktop** (البلجن مش بيشتغل على المتصفح).
   - لو معاك **View بس**: اختار **Duplicate to your drafts** وافتح النسخة.
2. شغّل **Plugins → Development → Figma MCP Bridge** (أو ⌘⌥P) وسيبه مفتوح.
3. ابعت اللينك لـ Claude Code وقول **"اعمل الفرونت"** أو **"اعمل الصفحة دي بحالاتها"**.

## المتطلبات
- Claude Code
- Figma **Desktop**
- Node.js 18+
- Google Chrome (للمقارنة بالديزاين)

## الحدود
- لو صاحب الفايل قافل "viewers can copy/export"، مش هينفع تعمل Duplicate، ولازم تطلب منه صلاحية.
- البلجن لازم يفضل مفتوح في فيجما طول ما Claude شغال على الديزاين.

## التحديث
شغّل أمر التسطيب في الخطوة 1 تاني.
