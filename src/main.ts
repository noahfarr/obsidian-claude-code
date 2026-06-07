import {
	FileSystemAdapter,
	ItemView,
	MarkdownRenderer,
	Notice,
	Plugin,
	WorkspaceLeaf,
} from 'obsidian';
import { ChildProcess, spawn } from 'child_process';
import process from 'process';
import {
	ClaudeCodeSettings,
	ClaudeCodeSettingTab,
	DEFAULT_SETTINGS,
} from './settings';

const VIEW_TYPE_CLAUDE = 'claude-code-view';

/** Shape of the JSON objects emitted by `claude --output-format stream-json`. */
interface StreamContentBlock {
	type: string;
	text?: string;
	name?: string;
	input?: Record<string, unknown>;
}

interface StreamEvent {
	type?: string;
	message?: { content?: StreamContentBlock[] };
	is_error?: boolean;
	result?: string;
	num_turns?: number;
}

/** Callbacks the view hooks into as the CLI streams output. */
interface RunHandlers {
	onAssistantText: (text: string) => void;
	onToolUse: (name: string, summary: string) => void;
	onError: (text: string) => void;
	onResult: (meta: string) => void;
	onClose: (code: number | null) => void;
}

export default class ClaudeCodePlugin extends Plugin {
	settings!: ClaudeCodeSettings;
	private activeProcesses = new Set<ChildProcess>();

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_CLAUDE,
			(leaf) => new ClaudeCodeView(leaf, this),
		);

		this.addRibbonIcon('bot', 'Claude Code', () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open-panel',
			name: 'Open panel',
			callback: () => {
				void this.activateView();
			},
		});

		this.addSettingTab(new ClaudeCodeSettingTab(this.app, this));
	}

	onunload() {
		// Stop any Claude Code processes still running when the plugin unloads.
		// (Obsidian detaches the plugin's leaves automatically.)
		for (const child of this.activeProcesses) {
			child.kill('SIGTERM');
		}
		this.activeProcesses.clear();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<ClaudeCodeSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_CLAUDE)[0];
		if (!leaf) {
			const right = workspace.getRightLeaf(false);
			if (!right) {
				new Notice('Could not open the Claude Code panel.');
				return;
			}
			leaf = right;
			await leaf.setViewState({ type: VIEW_TYPE_CLAUDE, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	/** Resolve the vault's absolute path, or null if not on a real filesystem. */
	getVaultPath(): string | null {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		return null;
	}

	/**
	 * Run the Claude Code CLI headlessly inside the vault. The prompt is piped
	 * over stdin so it never needs shell-escaping. Returns the child process
	 * (or null if it couldn't start) so the caller can stop it.
	 */
	runClaude(
		prompt: string,
		continueConversation: boolean,
		handlers: RunHandlers,
	): ChildProcess | null {
		const cwd = this.getVaultPath();
		if (!cwd) {
			handlers.onError(
				"This vault isn't on the local filesystem; Claude Code can't run.",
			);
			handlers.onClose(null);
			return null;
		}

		const bin = this.settings.claudeBinPath.trim() || 'claude';

		// Build a static flag string. Dynamic values go through env vars so the
		// prompt and model can't break out of the command.
		const flags = [
			'-p',
			'--output-format',
			'stream-json',
			'--verbose',
			'--permission-mode',
			this.settings.permissionMode,
		];
		if (this.settings.model.trim()) flags.push('--model', '"$CLAUDE_MODEL"');
		if (continueConversation) flags.push('--continue');

		const command = `exec "$CLAUDE_BIN" ${flags.join(' ')}`;
		const shell = process.env.SHELL || '/bin/zsh';

		let child: ChildProcess;
		try {
			child = spawn(shell, ['-l', '-c', command], {
				cwd,
				env: {
					...process.env,
					CLAUDE_BIN: bin,
					CLAUDE_MODEL: this.settings.model.trim(),
					FORCE_COLOR: '0',
				},
			});
		} catch (e) {
			handlers.onError(
				`Failed to launch Claude Code: ${e instanceof Error ? e.message : String(e)}`,
			);
			handlers.onClose(null);
			return null;
		}

		this.activeProcesses.add(child);

		// Feed the prompt over stdin, then close it so the CLI starts working.
		child.stdin?.write(prompt);
		child.stdin?.end();

		let buffer = '';
		child.stdout?.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			let nl = buffer.indexOf('\n');
			while (nl !== -1) {
				const line = buffer.slice(0, nl).trim();
				buffer = buffer.slice(nl + 1);
				if (line) this.handleStreamLine(line, handlers);
				nl = buffer.indexOf('\n');
			}
		});

		child.stderr?.on('data', (chunk: Buffer) => {
			const text = chunk.toString().trim();
			if (text) handlers.onError(text);
		});

		child.on('error', (err) => {
			handlers.onError(
				`Could not start "${bin}": ${err.message}. ` +
					'Set the full path to the claude binary in plugin settings if it is not on your PATH.',
			);
		});

		child.on('close', (code) => {
			this.activeProcesses.delete(child);
			if (buffer.trim()) this.handleStreamLine(buffer.trim(), handlers);
			handlers.onClose(code);
		});

		return child;
	}

	/** Parse one line of --output-format stream-json and dispatch to handlers. */
	private handleStreamLine(line: string, handlers: RunHandlers) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			return; // ignore non-JSON noise
		}
		if (!parsed || typeof parsed !== 'object') return;
		const event = parsed as StreamEvent;

		if (event.type === 'assistant') {
			const content = event.message?.content ?? [];
			for (const block of content) {
				if (block.type === 'text' && block.text) {
					handlers.onAssistantText(block.text);
				} else if (block.type === 'tool_use') {
					handlers.onToolUse(
						block.name ?? 'tool',
						summarizeToolInput(block.input),
					);
				}
			}
		} else if (event.type === 'result') {
			if (event.is_error) {
				handlers.onError(event.result ?? 'Claude Code reported an error.');
			}
			const turns =
				typeof event.num_turns === 'number' ? `${event.num_turns} turns` : 'done';
			handlers.onResult(turns);
		}
	}
}

/** Pull a short, human-readable detail out of a tool's input object. */
function summarizeToolInput(input?: Record<string, unknown>): string {
	if (!input) return '';
	const path = input.file_path ?? input.path ?? input.notebook_path;
	if (typeof path === 'string') return path;
	if (typeof input.pattern === 'string') return input.pattern;
	if (typeof input.command === 'string') return input.command;
	if (typeof input.url === 'string') return input.url;
	if (typeof input.prompt === 'string') return input.prompt.slice(0, 60);
	return '';
}

class ClaudeCodeView extends ItemView {
	plugin: ClaudeCodePlugin;
	private transcriptEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;
	private stopBtn!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	private currentChild: ChildProcess | null = null;
	private continueNext = false;
	private busy = false;

	constructor(leaf: WorkspaceLeaf, plugin: ClaudeCodePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CLAUDE;
	}

	getDisplayText(): string {
		return 'Claude Code';
	}

	getIcon(): string {
		return 'bot';
	}

	async onOpen() {
		const root = this.contentEl;
		root.empty();
		root.addClass('claude-code-view');

		this.transcriptEl = root.createDiv({ cls: 'claude-code-transcript' });
		this.addMeta('Ask Claude Code to create or edit notes in this vault.');

		const inputRow = root.createDiv({ cls: 'claude-code-inputrow' });
		this.inputEl = inputRow.createEl('textarea', {
			cls: 'claude-code-input',
			attr: {
				placeholder:
					'e.g. Create a note "Reading List" and add my open papers…  (Enter to send, Shift+Enter for newline)',
			},
		});
		this.registerDomEvent(this.inputEl, 'keydown', (evt) => {
			if (evt.key === 'Enter' && !evt.shiftKey) {
				evt.preventDefault();
				this.send();
			}
		});

		const buttons = inputRow.createDiv({ cls: 'claude-code-buttons' });
		this.statusEl = buttons.createDiv({ cls: 'claude-code-status' });

		this.stopBtn = buttons.createEl('button', { text: 'Stop' });
		this.stopBtn.disabled = true;
		this.registerDomEvent(this.stopBtn, 'click', () => {
			this.stop();
		});

		const newBtn = buttons.createEl('button', { text: 'New' });
		this.registerDomEvent(newBtn, 'click', () => {
			this.newConversation();
		});

		this.sendBtn = buttons.createEl('button', { text: 'Send', cls: 'mod-cta' });
		this.registerDomEvent(this.sendBtn, 'click', () => {
			this.send();
		});
	}

	async onClose() {
		this.stop();
	}

	private send() {
		if (this.busy) return;
		const prompt = this.inputEl.value.trim();
		if (!prompt) return;

		this.addUserMessage(prompt);
		this.inputEl.value = '';
		this.setBusy(true);

		let assistantEl: HTMLElement | null = null;
		const ensureAssistant = (): HTMLElement => {
			if (!assistantEl) {
				assistantEl = this.transcriptEl.createDiv({
					cls: 'claude-code-msg claude-code-msg-assistant',
				});
			}
			return assistantEl;
		};

		this.currentChild = this.plugin.runClaude(prompt, this.continueNext, {
			onAssistantText: (text) => {
				const block = ensureAssistant().createDiv();
				void MarkdownRenderer.render(this.app, text, block, '', this);
				this.scroll();
			},
			onToolUse: (name, summary) => {
				const tool = ensureAssistant().createDiv({ cls: 'claude-code-tool' });
				tool.createSpan({ cls: 'claude-code-tool-name', text: name });
				if (summary) tool.createSpan({ text: summary });
				this.scroll();
			},
			onError: (text) => {
				this.transcriptEl.createDiv({ cls: 'claude-code-error', text });
				this.scroll();
			},
			onResult: (meta) => {
				this.statusEl.setText(meta);
			},
			onClose: (code) => {
				this.currentChild = null;
				this.setBusy(false);
				// Once a turn completes, keep context for the next message.
				if (code === 0) this.continueNext = true;
				this.scroll();
			},
		});
	}

	private stop() {
		if (this.currentChild) {
			this.currentChild.kill('SIGTERM');
			this.currentChild = null;
			this.statusEl.setText('Stopped.');
		}
		this.setBusy(false);
	}

	private newConversation() {
		this.stop();
		this.continueNext = false;
		this.transcriptEl.empty();
		this.addMeta('New conversation.');
	}

	private setBusy(busy: boolean) {
		this.busy = busy;
		this.sendBtn.disabled = busy;
		this.stopBtn.disabled = !busy;
		if (busy) {
			this.statusEl.setText('Claude Code is working…');
			this.statusEl.addClass('claude-code-spinner');
		} else {
			this.statusEl.removeClass('claude-code-spinner');
		}
	}

	private addUserMessage(text: string) {
		this.transcriptEl.createDiv({
			cls: 'claude-code-msg claude-code-msg-user',
			text,
		});
		this.scroll();
	}

	private addMeta(text: string) {
		this.transcriptEl.createDiv({ cls: 'claude-code-meta', text });
	}

	private scroll() {
		this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
	}
}
