# Diva Routine
> Build jazz dance training routines from videos and photos: AI pose extraction, illustrated exercise sheets, Google sync and sharing.

[Español](README.md) · **English**

## Description

Diva Routine is a Windows desktop app for dancers and teachers. You collect class videos and photos (from your computer, YouTube, Instagram, TikTok or Facebook) into a visual library of folders, pick the stretches of video you care about on a zoomable timeline, and the app turns each movement into an illustrated sequence of key phases — poster style, with the dancer cut out and drawn as a clean illustration.

Those drawings become the building blocks of routines: order them by hand or automatically (warm-up → centre → kicks → turns → jumps → diagonals → floor → stretching), add reps and notes, and print or save the routine as an A4 PDF sheet.

Everything stays on your computer. Optionally, sign in with Google to keep your library in sync across computers through your own Google Drive, and share folders, routines and drawings with other people by their Gmail.

## Features

- **Visual library** with nested folders, drag & drop, multi-select, custom folder names and soft folder highlighting.
- **Import from social networks**: links and playlists from YouTube, TikTok and Facebook, and private saved collections from Instagram. Each network has a step-by-step connection tutorial; linked lists and collections re-sync automatically.
- **Zoomable timeline** with an overview bar and a clear frame preview of the selected stretch.
- **AI pose extraction** (MediaPipe): splits videos into exercises, detects technique (kicks, extensions, passé, plié, turns, jumps, floor work, relevé, arms…) and draws each key phase.
- **Routines** with manual or automatic ordering, reps, notes and printable A4 sheets.
- **Google sign-in & sync**: your data mirrored to a private folder in your Google Drive (free up to 15 GB).
- **Collaboration** (Firebase): shared folders where collaborators can add videos, routines with several editors, and shared drawings.
- **Windows installer with automatic updates**: new versions are downloaded in the background and installed with one click.

## Installation

1. Download `Diva-Routine-Setup-X.Y.Z.exe` from the [latest release](https://github.com/DivolandiaLabs/diva-routine/releases/latest).
2. Double-click it. The installer is not code-signed, so Windows may show "Windows protected your PC": click **More info → Run anyway**.
3. No admin rights or Node.js needed. Shortcuts are created on the desktop and in the Start menu.

Your data lives in `%LOCALAPPDATA%\Diva Routine` and is kept across updates and uninstalls.

### Updates

The installed app checks for a newer release on start-up and every 3 hours, downloads it in the background and shows a Windows notification. **Update now** installs it and reopens the app; **Later** installs it when you close the app.

## Usage

1. Open the app and **sign in with Google** (or choose to use it without an account).
2. In **Library**, use **Import** (paste links), **Upload** (local files) or **Social** (connect Instagram, YouTube, TikTok or Facebook and import lists).
3. Open a video, mark stretches on the timeline and press **Extract drawings**.
4. In **Routines**, select drawings, press **Routine**, choose the order and create it. Print or save it as PDF.
5. To share, open a folder or routine and press **Share**, then enter the other person's Gmail.

### Running from source

```bash
npm install
npm start          # browser at http://localhost:5177
npm run app        # Electron window
npm run instalador # build the Windows installer into dist/
```

Google sync needs your own OAuth desktop client (`google-client.json`) and sharing needs a Firebase project (`firebase-config.json`); both are configured once from **Settings** and are never committed.

## Requirements

- Windows 10 or 11 (64-bit).
- Internet connection for imports, the first pose-model download and Google sync.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for YouTube / TikTok / Facebook downloads.
- To run from source: Node.js 18 or newer.

## License

All rights reserved © DivolandiaLabs.

---
*Developed by [DivolandiaLabs](https://divolandialabs.github.io/)*
