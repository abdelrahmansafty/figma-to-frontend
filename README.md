# Figma → Frontend

لينك فيجما → فرونت شغال بكل حالاته. بيقرا الديزاين عن طريق بلجن على جهازك، فمفيش حد لعدد الطلبات، وبيشتغل حتى لو معاك View بس (عن طريق نسخة في الـ drafts). وقبل ما يبني أي حاجة بيدوّر على الكومبوننتس الموجودة في البروجكت ويستخدمها، وفي الآخر بيقارن النتيجة بالديزاين.

## المتطلبات
- Claude Code
- Figma **Desktop** (البلجن مش بيشتغل على المتصفح)
- Node.js 18+ (`npx` لازم يكون شغال)
- Google Chrome (للمقارنة بالديزاين)

## التسطيب (مرة واحدة)

### 1) الـ Skill والسيرفر في Claude Code
جوه Claude Code:
```
/plugin marketplace add abdelrahmansafty/figma-to-frontend
/plugin install figma-to-frontend@qtech-figma
```
وبعدين اعمل restart لـ Claude Code. السيرفر (`figma-bridge`) بيتسطب لوحده عن طريق `npx`.
التحديثات: `/plugin marketplace update qtech-figma`.

### 2) البلجن في فيجما
نزّل الريبو (Code → Download ZIP أو `git clone https://github.com/abdelrahmansafty/figma-to-frontend`) في مكان ثابت، وبعدين:
Figma Desktop → **Plugins → Development → Import plugin from manifest** → اختار `figma-plugin/manifest.json`.

## الاستخدام
1. افتح لينك الديزاين في Figma Desktop.
   - لو معاك **View بس**: اختار **Duplicate to your drafts** وافتح النسخة.
2. شغّل **Plugins → Development → Figma MCP Bridge** (أو ⌘⌥P) وسيبه مفتوح.
3. في Claude Code ابعت اللينك وقول: **"اعمل الفرونت"** أو **"اعمل الصفحة دي بحالاتها"**.

لو إنت جوه بروجكت موجود، هيدوّر على الكومبوننتس اللي عندك ويستخدمها، ولو فيه كومبوننت قريب من الديزاين بس مختلف شوية هيسألك تعمل إيه.

## الحدود
- لو صاحب الفايل قافل "viewers can copy/export"، مش هينفع تعمل Duplicate، ولازم تطلب منه صلاحية.
- البلجن لازم يفضل مفتوح في فيجما طول ما Claude شغال على الديزاين.

## ترخيص
البلجن والسيرفر من [Figma MCP Bridge](https://github.com/gethopp/figma-mcp-bridge) (MIT, GETHOPP LTD). الترخيص في `figma-plugin/LICENSE.md`.
