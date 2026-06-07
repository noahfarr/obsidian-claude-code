# Claude Code for Obsidian

Create and edit notes by chatting with the [Claude Code](https://docs.claude.com/en/docs/claude-code) agent, running headlessly inside your vault.

> **Unofficial.** This is a community plugin and is not affiliated with, endorsed by, or supported by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic.

## What it does

Adds a chat panel to the right sidebar. You type an instruction; the plugin runs the local `claude` command-line tool with your vault as its working directory. Claude Code can then read, create, and edit your notes as Markdown files, and the results stream back into the panel. Obsidian reloads any changed notes automatically.

Follow-up messages continue the same conversation (via `claude --continue`) until you start a new one.

## Requirements

- **Desktop only.** The plugin launches a local process and uses Node.js APIs, which are unavailable on Obsidian mobile.
- **The Claude Code CLI must be installed and authenticated separately.** Install it from the [official instructions](https://docs.claude.com/en/docs/claude-code) and sign in (via a Claude subscription or an Anthropic API key) by running `claude` once in a terminal. This plugin does not bundle, install, or manage the CLI, and it does not store any credentials.

## Installation

Until it is available in Community Plugins, install manually:

1. Build the plugin (`npm install && npm run build`) or download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Copy those three files into `<vault>/.obsidian/plugins/claude-code/`.
3. Enable **Claude Code** under Settings → Community plugins.

## Usage

- Click the robot ribbon icon, or run the command **Open panel**.
- Type an instruction (Enter to send, Shift+Enter for a newline) and Claude Code works inside your vault.
- **Stop** ends the current run; **New** starts a fresh conversation.

## Settings

- **Claude binary path** — absolute path to the `claude` executable. Leave empty to resolve `claude` from your login shell `PATH`.
- **Model** — model alias passed to `--model` (e.g. `opus`, `sonnet`). Empty uses the Claude Code default.
- **Permission mode** — how the agent handles tool use:
  - **Default (ask)** — the CLI's normal prompting behaviour.
  - **Accept edits** — auto-approves file edits but still gates other actions (default).
  - **Plan only** — proposes changes without writing files.
  - **Bypass permissions** — approves every action, including arbitrary shell commands. Use only if you understand the risk.

## Disclosures

This plugin makes the following actions that the Obsidian developer policies require be disclosed:

- **Network use.** The plugin itself makes no network requests, but the Claude Code CLI it launches sends your prompts and the contents of relevant notes to Anthropic's API to generate responses. See Anthropic's [privacy policy](https://www.anthropic.com/legal/privacy). No telemetry is collected by this plugin.
- **Running a local program.** The plugin executes the `claude` binary as a child process, with your vault directory as its working directory.
- **File access outside the vault.** Claude Code is a general-purpose agent. Through its built-in tools it can read and modify files outside the vault and run shell commands, subject to the selected permission mode. Choose a permission mode you are comfortable with, and review changes (e.g. with version control) before trusting them.

## License

[MIT](LICENSE)
