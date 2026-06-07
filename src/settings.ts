import { App, Modal, PluginSettingTab, Setting } from 'obsidian';
import type ClaudeCodePlugin from './main';

export type PermissionMode =
	| 'default'
	| 'acceptEdits'
	| 'bypassPermissions'
	| 'plan';

export interface ClaudeCodeSettings {
	/** Path to the claude binary. Empty = resolve "claude" from your shell PATH. */
	claudeBinPath: string;
	/** Model alias passed to --model. Empty = Claude Code default. */
	model: string;
	/** Permission mode for tool use. */
	permissionMode: PermissionMode;
}

export const DEFAULT_SETTINGS: ClaudeCodeSettings = {
	claudeBinPath: '',
	model: '',
	permissionMode: 'default',
};

export class ClaudeCodeSettingTab extends PluginSettingTab {
	plugin: ClaudeCodePlugin;

	constructor(app: App, plugin: ClaudeCodePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Claude binary path')
			.setDesc(
				'Absolute path to the Claude executable. Leave empty to resolve it from your login shell path.',
			)
			.addText((text) =>
				text
					.setPlaceholder('/Users/you/.local/bin/claude')
					.setValue(this.plugin.settings.claudeBinPath)
					.onChange(async (value) => {
						this.plugin.settings.claudeBinPath = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Model')
			.setDesc(
				'Model alias passed to --model (e.g. Opus, Sonnet). Leave empty for the Claude Code default.',
			)
			.addText((text) =>
				text
					.setPlaceholder('opus')
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Permission mode')
			.setDesc(
				'How Claude Code handles tool use. The accept-edits mode auto-approves file edits but still gates riskier actions; auto mode approves everything, including arbitrary shell commands.',
			)
			.addDropdown((dd) => {
				dd.addOption('default', 'Default')
					.addOption('acceptEdits', 'Accept edits')
					.addOption('plan', 'Plan mode')
					.addOption('bypassPermissions', 'Auto mode')
					.setValue(this.plugin.settings.permissionMode)
					.onChange((value) => {
						const mode = value as PermissionMode;
						// Auto mode runs everything unattended, so confirm first.
						if (mode === 'bypassPermissions') {
							new BypassConfirmModal(
								this.app,
								() => {
									this.plugin.settings.permissionMode = mode;
									void this.plugin.saveSettings();
								},
								() => {
									// Cancelled: revert the dropdown to the saved value.
									dd.setValue(this.plugin.settings.permissionMode);
								},
							).open();
							return;
						}
						this.plugin.settings.permissionMode = mode;
						void this.plugin.saveSettings();
					});
			});
	}
}

/** Confirmation shown before enabling the unattended auto mode. */
class BypassConfirmModal extends Modal {
	private readonly onConfirm: () => void;
	private readonly onCancel: () => void;
	private confirmed = false;

	constructor(app: App, onConfirm: () => void, onCancel: () => void) {
		super(app);
		this.onConfirm = onConfirm;
		this.onCancel = onCancel;
	}

	onOpen() {
		this.setTitle('Enable auto mode?');
		this.contentEl.createEl('p', {
			text: 'Auto mode runs every action automatically, including arbitrary shell commands, with no approval prompt. Only enable it if you trust the instructions you send.',
		});
		new Setting(this.contentEl)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Enable')
					.setWarning()
					.onClick(() => {
						this.confirmed = true;
						this.close();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
		if (this.confirmed) this.onConfirm();
		else this.onCancel();
	}
}
