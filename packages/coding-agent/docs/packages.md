> agent can help you create agent packages. Ask it to bundle your extensions, skills, prompt templates, or themes.

# Enterprise Agent Packages

Enterprise Agent packages bundle extensions, skills, prompt templates, and themes so you can share them through npm or git. A package can declare resources in `package.json` under the `agent` key, or use conventional directories.

## Table of Contents

- [Install and Manage](#install-and-manage)
- [Package Sources](#package-sources)
- [Creating a Enterprise Agent Package](#creating-a-agent-package)
- [Package Structure](#package-structure)
- [Dependencies](#dependencies)
- [Package Filtering](#package-filtering)
- [Enable and Disable Resources](#enable-and-disable-resources)
- [Scope and Deduplication](#scope-and-deduplication)

## Install and Manage

> **Security:** Enterprise Agent packages run with full system access. Extensions execute arbitrary code, and skills can instruct the model to perform any action including running executables. Review source code before installing third-party packages.

```bash
eagent install npm:@foo/bar@1.0.0
eagent install git:github.com/user/repo@v1
eagent install https://github.com/user/repo  # raw URLs work too
eagent install /absolute/path/to/package
eagent install ./relative/path/to/package

eagent remove npm:@foo/bar
eagent list                     # show installed packages from settings
eagent update                   # update packages and reconcile pinned git refs
eagent update --models          # refresh model catalogs only
eagent update npm:@foo/bar      # update one package
eagent update --extension npm:@foo/bar
```

These commands manage Enterprise Agent packages. CLI releases are installed through the approved internal package-management process.

By default, `install` and `remove` write to user settings (`~/.eagent/settings.json`). Use `-l` to write to project settings (`.eagent/settings.json`) instead. Startup only loads packages already present on disk; use `eagent install` explicitly to add missing packages.

To try a package without installing it, use `--extension` or `-e`. This installs to a temporary directory for the current run only:

```bash
eagent -e npm:@foo/bar
eagent -e git:github.com/user/repo
```

## Package Sources

Enterprise Agent accepts three source types in settings and `eagent install`.

### npm

```
npm:@scope/pkg@1.2.3
npm:pkg
```

- Versioned specs are pinned and skipped by package updates (`eagent update`).
- User installs go under `~/.eagent/npm/`.
- Project installs go under `.eagent/npm/`.
- Set `npmCommand` in `settings.json` to pin npm package lookup and install operations to a specific wrapper command such as `mise` or `asdf`.

Example:

```json
{
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

### git

```
git:github.com/user/repo@v1
git:git@github.com:user/repo@v1
https://github.com/user/repo@v1
ssh://git@github.com/user/repo@v1
```

- Without `git:` prefix, only protocol URLs are accepted (`https://`, `http://`, `ssh://`, `git://`).
- With `git:` prefix, shorthand formats are accepted, including `github.com/user/repo` and `git@github.com:user/repo`.
- HTTPS and SSH URLs are both supported.
- SSH URLs use your configured SSH keys automatically (respects `~/.ssh/config`).
- For non-interactive runs (for example CI), you can set `GIT_TERMINAL_PROMPT=0` to disable credential prompts and set `GIT_SSH_COMMAND` (for example `ssh -o BatchMode=yes -o ConnectTimeout=5`) to fail fast.
- Refs are pinned tags or commits. `eagent update` does not move them to newer refs, but it does reconcile an existing clone to the configured ref.
- Use `eagent install git:host/user/repo@new-ref` to update settings and move an existing package to a new pinned ref.
- Cloned to `~/.eagent/git/<host>/<path>` (global) or `.eagent/git/<host>/<path>` (project).
- When reconciliation changes the checkout, agent resets and cleans the clone, then runs `npm install` if `package.json` exists.

**SSH examples:**
```bash
# git@host:path shorthand (requires git: prefix)
eagent install git:git@github.com:user/repo

# ssh:// protocol format
eagent install ssh://git@github.com/user/repo

# With version ref
eagent install git:git@github.com:user/repo@v1.0.0
```

### Local Paths

```
/absolute/path/to/package
./relative/path/to/package
```

Local paths point to files or directories on disk and are added to settings without copying. Relative paths are resolved against the settings file they appear in. If the path is a file, it loads as a single extension. If it is a directory, agent loads resources using package rules.

## Creating a Enterprise Agent Package

Add an `eagent` manifest to `package.json` or use conventional directories. Include the `agent-package` keyword for discoverability.

```json
{
  "name": "my-package",
  "keywords": ["agent-package"],
  "eagent": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Paths are relative to the package root. Arrays support glob patterns and `!exclusions`.

## Package Structure

### Convention Directories

If no `eagent` manifest is present, Enterprise Agent auto-discovers resources from these directories:

- `extensions/` loads `.ts` and `.js` files
- `skills/` recursively finds `SKILL.md` folders and loads top-level `.md` files as skills
- `prompts/` loads `.md` files
- `themes/` loads `.json` files

## Dependencies

Third party runtime dependencies belong in `dependencies` in `package.json`. Dependencies that do not register extensions, skills, prompt templates, or themes also belong in `dependencies`. When agent installs a package from npm or git, it runs `npm install`, so those dependencies are installed automatically.

Enterprise Agent bundles core packages for extensions and skills. If you import any of these, list them in `peerDependencies` with a `"*"` range and do not bundle them: `@enterprise-agent/ai`, `@enterprise-agent/agent-core`, `@enterprise-agent/coding-agent`, `@enterprise-agent/tui`, `typebox`.

Other agent packages must be bundled in your tarball. Add them to `dependencies` and `bundledDependencies`, then reference their resources through `node_modules/` paths. Enterprise Agent loads packages with separate module roots, so separate installs do not collide or share modules.

Example:

```json
{
  "dependencies": {
    "shitty-extensions": "^1.0.1"
  },
  "bundledDependencies": ["shitty-extensions"],
  "eagent": {
    "extensions": ["extensions", "node_modules/shitty-extensions/extensions"],
    "skills": ["skills", "node_modules/shitty-extensions/skills"]
  }
}
```

## Package Filtering

Filter what a package loads using the object form in settings:

```json
{
  "packages": [
    "npm:simple-pkg",
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"],
      "themes": ["+themes/legacy.json"]
    }
  ]
}
```

`+path` and `-path` are exact paths relative to the package root.

- Omit a key to load all of that type.
- Use `[]` to load none of that type.
- `!pattern` excludes matches.
- `+path` force-includes an exact path.
- `-path` force-excludes an exact path.
- Filters layer on top of the manifest. They narrow down what is already allowed.

## Enable and Disable Resources

Use `eagent config` to enable or disable extensions, skills, prompt templates, and themes from installed packages and local directories. `eagent config` starts in global settings (`~/.eagent/settings.json`); press Tab to switch between global and project-local modes. Use `eagent config -l` to start in project overrides (`.eagent/settings.json`) with inherited global resources dimmed.

## Scope and Deduplication

Packages can appear in both global and project settings. If the same package appears in both, the project entry wins unless the project entry has `autoload: false`, in which case it is applied as a delta over the global entry. Identity is determined by:

- npm: package name
- git: repository URL without ref
- local: resolved absolute path
