import type { ParsedTaskText, TextSegment, WikiLinkSegment } from "./types";

/**
 * Regex pattern to match Obsidian wiki-links
 * Matches: [[path]] or [[path|display text]]
 */
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Parses task text and extracts wiki-link information.
 * Supports Obsidian wiki-link syntax: [[filename]] or [[filename|display text]]
 *
 * @param text - The task text to parse
 * @returns ParsedTaskText with segments and hasWikiLinks flag
 */
export function parseWikiLinks(text: string): ParsedTaskText {
	const segments: Array<TextSegment | WikiLinkSegment> = [];
	let lastIndex = 0;
	let hasWikiLinks = false;

	// Reset regex state
	WIKILINK_REGEX.lastIndex = 0;

	let match;
	while ((match = WIKILINK_REGEX.exec(text)) !== null) {
		hasWikiLinks = true;

		// Add text before the match
		if (match.index > lastIndex) {
			segments.push({
				type: "text",
				content: text.slice(lastIndex, match.index),
			});
		}

		// Add the wiki-link
		segments.push({
			type: "wikilink",
			path: match[1]!.trim(),
			displayText: match[2]?.trim(),
		});

		lastIndex = match.index + match[0].length;
	}

	// Add remaining text after last match
	if (lastIndex < text.length) {
		segments.push({ type: "text", content: text.slice(lastIndex) });
	}

	// If no wiki-links found and no segments, return the entire text as one segment
	if (segments.length === 0) {
		segments.push({ type: "text", content: text });
	}

	return { segments, hasWikiLinks };
}

/**
 * Checks if text contains wiki-links without full parsing.
 *
 * @param text - The text to check
 * @returns Whether the text contains wiki-links
 */
export function hasWikiLinks(text: string): boolean {
	WIKILINK_REGEX.lastIndex = 0;
	return WIKILINK_REGEX.test(text);
}
