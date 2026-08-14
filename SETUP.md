# Creating this repository

The steps to stand up the public repo. Your source stays in its own private
repository — nothing here contains application code.

## 1. Create it

On GitHub → **New repository**

| Field | Value |
|---|---|
| Name | `atlas.api` |
| Visibility | **Public** |
| Add a README | **No** — one is included here |
| .gitignore / licence | **None** — both are included here |

## 2. Push these files

```bash
cd public-repo
git init
git add .
git commit -m "Atlas: downloads and issue tracking"
git branch -M main
git remote add origin https://github.com/softtunners/atlas.api.git
git push -u origin main
```

## 3. Turn on what it needs

**Settings → General → Features**

- ✅ **Issues** — the point of the repo
- ✅ **Discussions** — questions that are not bugs
- ❌ **Wikis**, ❌ **Projects** — unused, and an empty tab looks abandoned

**Settings → Actions → General → Workflow permissions**

- ✅ **Read and write permissions** — the release workflow needs this to attach
  installers

## 4. The app already points here

Every link in the site and this README already targets
`github.com/softtunners/atlas.api` — nothing to change.

## 5. Cut a release

The private repo builds the apps; this repo hosts them.

**Automatically** — copy `.github/workflows/release.yml` into your *private*
repo and push a tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

It builds on macOS and Windows runners and opens a draft release. Review it,
then publish.

**By hand** — build locally and upload:

```bash
npm run dist:mac        # release/*.dmg, release/*.zip
```

Then GitHub → **Releases → Draft a new release**, tag `v0.1.0`, drag the files
from `release/` in, publish.

> Build Windows on a Windows machine or in Actions. Producing an NSIS installer
> from macOS needs Wine and is not worth the trouble.

## 6. Check the download links resolve

The site links to `releases/latest/download/<file>`, which only works once a
release is **published** (not draft) and the filenames match:

- `Atlas-0.1.0-arm64.dmg`
- `Atlas-0.1.0.dmg`
- `Atlas-Setup-0.1.0.exe`

If you rename the artifacts, update `BUILDS` in `DownloadPage.tsx` to match.
