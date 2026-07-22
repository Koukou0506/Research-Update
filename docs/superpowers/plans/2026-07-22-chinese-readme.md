# Chinese README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete, readable Simplified Chinese project guide at `README_zh.md`.

**Architecture:** Translate the existing README section-for-section while preserving technical literals. Update only the behavioral wording that has changed in the current implementation: startup and manual refresh now regenerate the daily selection and research radar.

**Tech Stack:** UTF-8 Markdown, PowerShell examples

## Global Constraints

- Create `README_zh.md`; do not edit `README.md`.
- Preserve commands, environment variables, URLs, paths, and product names.
- Do not document unimplemented behavior.

---

### Task 1: Create and verify the Chinese guide

**Files:**
- Create: `README_zh.md`

**Interfaces:**
- Consumes: section structure and technical literals from `README.md`
- Produces: a standalone Simplified Chinese setup and usage guide

- [ ] Create sections for 项目简介、环境要求、安装与运行、ADS 配置、界面使用、可选 AI 分析、备份与迁移、本地数据、验证.
- [ ] Preserve the PowerShell blocks for development, production, and verification, plus both dotenv blocks.
- [ ] Describe startup/manual refresh using the current recomputation behavior.
- [ ] Run `rg -n "鐮|闆|鎼|鍏|鏇|鏁|瀵|TBD|TODO" README_zh.md`; expect no matches.
- [ ] Run `git diff --check -- README_zh.md`; expect no whitespace errors.
- [ ] Compare required literals with `README.md`: `Node.js 22`, `http://localhost:5173`, `http://localhost:4173`, `ADS_API_TOKEN`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `DATABASE_PATH`, `npm test`, `npm run build`, and `npm run test:e2e` must all occur in `README_zh.md`.
- [ ] Commit only `README_zh.md` and this plan with message `docs: add Chinese README`; leave `Research-Update/` untracked.
