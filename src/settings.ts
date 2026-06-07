import { App, PluginSettingTab, Setting } from 'obsidian';
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
	permissionMode: 'acceptEdits',
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
				'How Claude Code handles tool use. The accept-edits mode auto-approves file edits but still gates riskier actions; the bypass-permissions mode approves everything, including arbitrary shell commands.',
			)
			.addDropdown((dd) =>
				dd
					.addOption('default', 'Default (ask)')
					.addOption('acceptEdits', 'Accept edits')
					.addOption('plan', 'Plan only (no edits)')
					.addOption('bypassPermissions', 'Bypass permissions')
					.setValue(this.plugin.settings.permissionMode)
					.onChange(async (value) => {
						this.plugin.settings.permissionMode = value as PermissionMode;
						await this.plugin.saveSettings();
					}),
			);
	}
}
