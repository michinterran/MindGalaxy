# Export font notice

MindGalaxy PDF exports embed Noto Sans KR from the npm package
`@expo-google-fonts/noto-sans-kr`.

- Package license: `MIT AND OFL-1.1`
- Font license file included by the package: `LICENSE_FONT` / SIL Open Font License 1.1
- Use: server-side PDF rendering only, to keep Korean text readable in exported PDFs

No font file is copied into this repository. The renderer resolves the installed package
asset at runtime during the Next.js node server build.
