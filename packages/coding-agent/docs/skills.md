# Skills

Skills are instruction packages loaded on demand. A skill is normally a directory containing `SKILL.md` with YAML frontmatter:

```markdown
---
name: code-review
description: Reviews a change for correctness, security, and maintainability.
---

# Code Review

Read the changed files and run the relevant checks.
```

Enterprise Agent discovers skills from:

- `~/.eagent/skills/`
- `~/.agents/skills/`
- `.eagent/skills/` in trusted projects
- `.agents/skills/` in trusted projects and ancestors
- configured packages and `settings.json` paths
- explicit `--skill <path>` arguments

Skill names use lowercase letters, numbers, and hyphens. Descriptions should state both capability and trigger conditions. Files referenced by a skill should use paths relative to the skill directory.

Skills may contain scripts and can instruct the model to perform powerful actions. Review all content before enabling a skill. Disable automatic discovery with `--no-skills`; explicit `--skill` paths still load.

When skill commands are enabled, invoke one with `/skill:name` followed by optional arguments.
