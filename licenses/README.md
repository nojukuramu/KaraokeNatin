# Third-Party Licenses

This directory contains license files for third-party software used in KaraokeNatin.

## yt-dlp

KaraokeNatin uses [yt-dlp](https://github.com/yt-dlp/yt-dlp) for YouTube video integration and search functionality.

### License Files

- **yt-dlp-LICENSE.txt**: The Unlicense license for yt-dlp core (public domain)
- **yt-dlp-THIRD_PARTY_LICENSES.txt**: Third-party licenses for components bundled with yt-dlp executables

### Important Notes

- The yt-dlp core project is released into the public domain under The Unlicense
- The PyInstaller-bundled Windows executables (`.exe` files) include third-party components under various licenses, most notably:
  - Python (PSF-2.0)
  - Various Python packages (MIT, BSD, Apache-2.0, GPLv2+, GPLv3+, etc.)
  
Since this project distributes the Windows executable of yt-dlp, the combined work falls under GPLv3+ licensing for that executable.

### More Information

For the most up-to-date license information, please visit:
- yt-dlp GitHub: https://github.com/yt-dlp/yt-dlp
- yt-dlp License: https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE
- yt-dlp Third-Party Licenses: https://github.com/yt-dlp/yt-dlp/blob/master/THIRD_PARTY_LICENSES.txt
