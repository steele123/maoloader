import type { Component } from "svelte";
import FileArchiveIcon from "@lucide/svelte/icons/file-archive";
import FileBracesIcon from "@lucide/svelte/icons/file-braces";
import FileCodeIcon from "@lucide/svelte/icons/file-code";
import FileIcon from "@lucide/svelte/icons/file";
import FileImageIcon from "@lucide/svelte/icons/file-image";
import FileTextIcon from "@lucide/svelte/icons/file-text";
import FileTypeIcon from "@lucide/svelte/icons/file-type";
import FileVideoCameraIcon from "@lucide/svelte/icons/file-video-camera";
import FileVolumeIcon from "@lucide/svelte/icons/file-volume";
import FolderIcon from "@lucide/svelte/icons/folder";
import PaletteIcon from "@lucide/svelte/icons/palette";

export type FileType = {
	icon: Component;
	/** Picks the icon colour; see `.file-icon[data-tone]` in layout.css. */
	tone: string;
	label: string;
};

const types: Record<string, FileType> = {
	script: { icon: FileCodeIcon, tone: "script", label: "Script" },
	markup: { icon: FileCodeIcon, tone: "markup", label: "HTML" },
	style: { icon: PaletteIcon, tone: "style", label: "Stylesheet" },
	data: { icon: FileBracesIcon, tone: "data", label: "Data" },
	text: { icon: FileTextIcon, tone: "text", label: "Text" },
	image: { icon: FileImageIcon, tone: "image", label: "Image" },
	audio: { icon: FileVolumeIcon, tone: "audio", label: "Audio" },
	video: { icon: FileVideoCameraIcon, tone: "video", label: "Video" },
	font: { icon: FileTypeIcon, tone: "font", label: "Font" },
	archive: { icon: FileArchiveIcon, tone: "archive", label: "Archive" },
	other: { icon: FileIcon, tone: "other", label: "File" }
};

const byExtension: Record<string, keyof typeof types> = {
	js: "script", mjs: "script", cjs: "script", ts: "script", jsx: "script", tsx: "script",
	html: "markup", htm: "markup", svelte: "markup", vue: "markup",
	css: "style", scss: "style", sass: "style", less: "style",
	json: "data", jsonc: "data", yaml: "data", yml: "data", toml: "data", xml: "data",
	md: "text", markdown: "text", txt: "text", license: "text",
	png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", ico: "image", avif: "image",
	mp3: "audio", ogg: "audio", wav: "audio", flac: "audio", m4a: "audio",
	mp4: "video", webm: "video", mov: "video",
	woff: "font", woff2: "font", ttf: "font", otf: "font",
	zip: "archive", rar: "archive", "7z": "archive", gz: "archive"
};

const folder: FileType = { icon: FolderIcon, tone: "folder", label: "Folder" };

export function fileType(path: string, kind: "file" | "folder" = "file"): FileType {
	if (kind === "folder") return folder;
	const name = path.split("/").pop()?.toLowerCase() ?? "";
	// README, LICENSE and friends usually have no extension.
	const extension = name.includes(".") ? name.split(".").pop()! : name;
	return types[byExtension[extension] ?? (/^(readme|license|changelog)$/.test(extension) ? "text" : "other")];
}
