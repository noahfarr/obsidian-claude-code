import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';

export default tseslint.config(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// Teach the sentence-case rule about product proper nouns and the
			// model aliases / file paths used in our UI strings.
			'obsidianmd/ui/sentence-case': [
				'error',
				{
					brands: ['Claude', 'Claude Code', 'Anthropic', 'Opus', 'Sonnet'],
					// Lowercase CLI aliases and example paths shown verbatim in placeholders.
					ignoreRegex: ['^/', '^opus$', '^sonnet$'],
				},
			],
		},
	},
);
