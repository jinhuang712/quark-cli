// Quark stores ' " < > in file names as HTML entities (a quirk of its own web app: the same
// names show up escaped in its UI). Folder creation also refuses " < > \ : * ? |.
const ESCAPES = { "'": '&#39;', '"': '&quot;', '<': '&lt;', '>': '&gt;' };

// The name Quark ends up storing for `name`.
export const stored = (name) => name.replace(/['"<>]/g, (c) => ESCAPES[c]);

// Does the drive entry `driveName` correspond to the name the caller asked for?
export const sameName = (driveName, asked) => driveName === asked || driveName === stored(asked);

// Characters Quark refuses in a folder name.
export const FORBIDDEN = '" < > \\ : * ? |';
