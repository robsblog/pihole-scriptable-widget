# Pi-hole Scriptable Widget (iOS)

An iOS home screen widget for **Scriptable** that displays key metrics from a
local **Pi-hole** instance in a compact, readable format.

The widget supports **Small**, **Medium**, and **Large** sizes, uses the
**Pi-hole v6 API (session-based authentication)**, and is designed for quick **health and status checks** without opening the Pi-hole web interface. 


## Key Features

- Small / Medium / Large widget layouts (auto-selected by widget family)
- Prominent display of **blocking percentage**
- **Health status indicator** (OK / Suspicious / Offline / Error)
- Timestamp and age of last successful update
- Secure password storage via **iOS Keychain**
- **Tap to Refresh**: tapping the widget triggers a data refresh
- Automatic language detection with manual override (**DE / EN / Auto**)
- Graceful fallback to cached values if Pi-hole is unreachable


## Screenshots

![Screenshot](https://github.com/robsblog/pihole-scriptable-widget/blob/main/screenshot_widgets.png)


## Requirements

- iOS / iPadOS
- [Scriptable](https://scriptable.app)
- [Pi-hole](https://github.com/pi-hole/pi-hole)
- Pi-hole reachable from the local network (LAN/VPN)


## Installation

1. Install **Scriptable** from the App Store  
2. Create a new script in Scriptable  
3. Copy the contents of `pihole-widget.js` into the script  
4. Adjust the configuration section at the top of the script:

```js
// Prefer IP addresses to avoid DNS issues on iOS
const PIHOLE_BASE = "http://192.168.1.10";
```

5. Run the script once inside Scriptable  
   → you will be prompted to enter your Pi-hole admin password  
6. Add the script as a widget to your home screen


## Widget Interaction: Tap to Refresh

When you **tap the widget**, Scriptable is launched with a special action
parameter.

Instead of opening the Pi-hole web UI, the widget will:

- immediately re-fetch data from the Pi-hole API
- update the widget contents
- update the cache and timestamps accordingly

This allows quick manual refreshes while keeping the widget lightweight and
focused on status visibility.

> Note: Actual refresh frequency is still subject to iOS widget scheduling.
> The tap explicitly triggers a refresh attempt.

## Health Status Indicator

The widget shows a **single, consolidated health status** to indicate the
current connection and data quality state:

- **OK** – Pi-hole is reachable and actively used by multiple clients
- **Suspicious** – Pi-hole is reachable, but usage patterns look unusual
  (for example, very few clients or unexpectedly low activity)
- **Offline** – Pi-hole is not reachable from the current network
  (for example, when you are outside your home network)
- **Error** – Pi-hole is reachable, but the API returns errors or unusable data
  (for example, authentication or server-side issues)

The goal of this indicator is not strict monitoring, but **early visibility**
into situations where Pi-hole might be unavailable, bypassed, or misconfigured.

If live data cannot be fetched, the widget automatically falls back to the
last known cached values.


## Widget Layouts

### Small
- Blocking percentage
- Blocked queries
- Total queries

### Medium
- Blocking percentage
- Total vs blocked queries
- Domains on blocklists (secondary emphasis)

### Large
- Blocking percentage
- Total / Blocked queries
- Forwarded / Cached queries
- Clients and unique domains
- Footer indicating whether data is live or cached, plus last update time and age


## Language Support (i18n)

The widget supports **German** and **English**.

### Automatic Mode (default)

If language is set to `auto`, the widget uses the following logic:

1. German (`de`) if:
   - system language is German, or
   - locale indicates a DACH region (`DE`, `AT`, `CH`, `LI`)
2. English (`en`) otherwise

This is intentionally heuristic to support setups like `en_DE`.

### Manual Override

You can manually select the language when running the script inside Scriptable:

- Open Scriptable
- Run the script directly
- Choose **“Change language”** from the menu
- Select `Auto`, `Deutsch`, or `English`

The selection is stored securely in the iOS Keychain.


## Security & Privacy

- Pi-hole admin password is stored **only** in the iOS Keychain
- No credentials are stored in plaintext
- No telemetry or third-party services
- All API requests are sent directly to your Pi-hole instance


## Configuration Options

Key configuration values in the script:

- `PIHOLE_BASE` – Pi-hole base URL or IP address (preferred)
- `REFRESH_HOURS` – iOS refresh hint interval
- `TIMEOUT_LOGIN`, `TIMEOUT_STATS` – request timeouts
- Widget layouts: `buildSmall`, `buildMedium`, `buildLarge`
- Displayed metrics mapping: `mapToWidgetFields`


## Limitations

- Widget refresh timing is ultimately controlled by iOS
- When Pi-hole is not reachable from the current network, the widget shows an "Offline" state and falls back to cached values

## Contributing

Pull requests and suggestions are welcome.
Please keep changes focused and document behavior changes clearly.
