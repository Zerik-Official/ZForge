# Launcher themes

A theme changes how ZForge looks: colors and fonts of the whole launcher, images for the shared controls, and the layout of the game settings categories. Every part is optional, so a theme can be as small as a few colors.

The launcher ships no game assets. A theme brings its own images and fonts.

## Installing

- **Import**: Launcher settings → Appearance → *Import .zip*. The zip must contain `theme.json` at its root or inside a single top folder. A theme with the same `id` is replaced.
- **Copy**: open *Themes folder* (`%APPDATA%\com.zforge.launcher\themes`) and copy the theme folder there. The folder name must match the `id`.

Pick the theme with *Use*. Invalid themes are listed with the reason and cannot be used; if the active theme breaks, the launcher falls back to the default one.

## Folder

```text
themes/
└── my-theme/
    ├── theme.json
    ├── icon.png
    ├── previews/
    │   └── settings.png
    ├── img/
    │   ├── checkbox-box.png
    │   └── ...
    └── fonts/
        └── body.ttf
```

Every file is referenced by a path relative to the theme folder. Paths cannot leave the folder. Images: `png`, `jpg`, `jpeg`, `webp`, `gif` and `blp`. Fonts: `ttf`, `otf`, `woff`, `woff2`. A zip is limited to 64 MiB and 2000 files.

BLP images (the game texture format) are converted to PNG the first time the theme is loaded and kept in the theme's `.cache` folder; they are converted again when the BLP file changes. Only the first mipmap is used.

An `icon.*` file in the theme folder (any of the image formats above) is shown next to the theme in the list, unless `icon` points to another file.

## theme.json

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | integer | Yes | Always `1` |
| `id` | string | Yes | Lowercase letters, digits, `-` and `_`, up to 64 characters. `dark` is reserved |
| `name` | string | Yes | Name shown in the list |
| `author`, `version`, `description` | string | No | Shown in the list and in the theme details |
| `requires` | string | No | Launcher versions the theme supports, see below. Any version when absent |
| `icon` | string | No | Icon shown in the list; defaults to the `icon.*` file of the folder |
| `previews` | array | No | Screenshots shown in the theme details, in order |
| `colors` | object | No | Color tokens, see below |
| `fonts` | array | No | `{ "family", "file" }` fonts to load |
| `typography` | object | No | `body` and `heading`: font families used for text and for titles and labels |
| `controls` | object | No | Images of the shared controls |
| `layouts` | object | No | Layouts by settings category id |

### Launcher version

`requires` is one requirement in [semver](https://docs.rs/semver/latest/semver/struct.VersionReq.html) syntax, so a minimum and a maximum fit in one key. Separate several comparators with commas:

| `requires` | Meaning |
| --- | --- |
| `>=0.2.0` | ZForge 0.2.0 or newer |
| `<=1.0.0` | Up to ZForge 1.0.0 |
| `>=0.2.0, <=1.0.0` | From 0.2.0 to 1.0.0, both included |
| `^0.2` | Any 0.2.x version |

A theme whose requirement the running launcher does not meet is listed as not supported and cannot be used. An invalid requirement makes the theme invalid.

### Colors

Keys are the launcher tokens without `--`: `bg`, `bg-soft`, `bg-card`, `bg-elevated`, `bg-hover`, `bg-input`, `border`, `border-soft`, `border-strong`, `primary`, `primary-hover`, `primary-active`, `on-primary` (text and icons drawn on `primary`), `primary-dim`, `primary-soft`, `primary-glow`, `accent`, `accent-dim`, `accent-glow`, `success`, `warning`, `danger`, `info`, `text`, `text-soft`, `muted`, `muted-2`, `muted-3`, `scroll-track`, `scroll-thumb`, `scroll-thumb-hover`.

Values are CSS colors such as `#c8a24a` or `rgba(200, 162, 74, 0.25)`; `url(...)` is not accepted.

### Images

An **image** is drawn stretched to its box:

```json
{ "file": "img/check.png", "width": 22, "height": 22 }
```

A **frame** is a nine-slice image: the corners keep their size and the edges and center stretch. `slice` is in image pixels and `border` in screen pixels, both as top, right, bottom, left. `border` defaults to `slice`, and `fill: false` leaves the center empty.

```json
{ "file": "img/panel.png", "slice": [16, 16, 16, 16], "border": [12, 12, 12, 12], "fill": true }
```

### Controls

| Control | Fields |
| --- | --- |
| `checkbox` | `box` and `check` images; optional `hover` (box under the pointer) and `checkDisabled` |
| `slider` | `track` frame and `thumb` image |
| `select` | `frame` frame for the dropdown and its list; optional `arrow` image |
| `tab` | `active` and `inactive` frames for the settings category tabs |
| `panel` | Frame drawn around layout sections |

They apply everywhere the launcher uses those controls.

### Layouts

A layout replaces how one category of the game settings window is drawn. Keys are category ids from the settings schema: `launch`, `server`, `graphics`, `effects`, `sound`. Categories without a layout keep the default look.

```json
"layouts": {
  "graphics": {
    "width": 640,
    "height": 300,
    "sections": [
      {
        "title": "settings.categories.graphics",
        "x": 0, "y": 0, "width": 640, "height": 176,
        "framed": true,
        "controls": [
          { "setting": "resolution", "x": 16, "y": 36, "width": 295 }
        ]
      }
    ]
  }
}
```

- The canvas is `width` × `height` layout pixels and is scaled to fit the window.
- Sections are placed on the canvas; controls are placed inside their section.
- `title` is a launcher translation key, such as `settings.categories.graphics`, or literal text.
- `framed` (default `true`) draws the `panel` frame, or a plain box without one.
- `setting` is a key of the settings schema (for example `resolution`, `refresh_rate`, `windowed`, `farclip`); unknown keys are skipped.

## Example

[`themes/example`](themes/example/theme.json) recolors the launcher in gold and lays out the *Graphics* and *Effects* categories in panels. It uses no images, so it can be zipped and imported as is. Add an `icon.png` and a `previews` list to try the list icon and the details view.
