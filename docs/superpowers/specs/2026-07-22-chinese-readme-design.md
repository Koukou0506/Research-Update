# Chinese README Design

## Goal

Add a complete Simplified Chinese project guide at `README_zh.md` while leaving the existing English `README.md` unchanged.

## Content

The Chinese README mirrors the English guide's structure: project overview, requirements, installation and startup, ADS configuration, dashboard usage, optional AI analysis, backup and migration, local data, and verification.

Commands, environment-variable names, URLs, file paths, product names, and source names remain unchanged. Corrupted Chinese labels embedded in the English source are restored to readable Chinese in the new file.

The usage section reflects current implemented behavior: opening the interface refreshes enabled saved searches and then regenerates the daily selection and research radar; manual refresh performs the same sequence.

## Constraints

- Create only `README_zh.md` for the translated artifact.
- Do not edit or rename `README.md`.
- Do not document unimplemented features.
- Use UTF-8 Markdown and PowerShell command examples consistent with the existing guide.

## Verification

- Confirm every English README section has a Chinese counterpart.
- Confirm every command, environment variable, URL, and local path is preserved accurately.
- Confirm the file contains no mojibake or placeholder text.
- Run `git diff --check` on the new README.
