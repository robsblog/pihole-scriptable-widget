# Pi-hole Scriptable Widget (iOS)

An iOS widget for **Scriptable** that displays key Pi-hole metrics in a clean,
readable layout.  
Supports **Small**, **Medium**, and **Large** widget sizes and uses the **Pi-hole v6 API**.

The widget automatically falls back to cached values if Pi-hole is not reachable
and clearly indicates whether the displayed data is **Live** or from **Cache**.


## Features

- Pi-hole v6 API support (session-based authentication)
- Small / Medium / Large widget layouts
- Prominent display of blocking percentage
- Live vs Cache status indicator
- Timestamp of last successful update
- Secure password storage via iOS Keychain (no plaintext credentials)
- Automatic refresh hint every 6 hours


## Screenshots
![Screenshot](https://github.com/robsblog/pihole-scriptable-widget/blob/main/Screenshot%20-%20Widgets.jpg)


## Requirements

- iOS / iPadOS
- [Scriptable](https://scriptable.app)
- [Pi-hole](https://github.com/pi-hole/pi-hole) (v6)
- Pi-hole reachable from your local network


## Installation

1. Install **Scriptable** from the App Store
2. Create a new script in Scriptable
3. Copy the contents of `pihole-widget.js` into the script
4. Adjust the configuration section at the top of the script:

```js
// Set to your Pi-hole base URL or IP address
const PIHOLE_BASE = "http://pi.hole";
// Example: http://192.168.1.10
```

5. Run the script once inside Scriptable
→ you will be prompted to enter your Pi-hole admin password
6. Add the script as a widget to your home screen

## Widget Layouts
Small
- Blocking percentage (primary metric)
- Blocked and total query count

Medium
- Blocking percentage (primary metric)
- Total queries and blocked queries
- Domains on blocklists (low emphasis)

Large
- Blocking percentage with visual separation
- Total / Blocked queries
- Forwarded / Cached queries
- Client and domain statistics
- Footer with Live / Cache status and last update time

## Security
- The Pi-hole admin password is stored securely in the iOS Keychain
- No credentials are stored in plaintext
- No data is sent to third-party services
- All API requests are made directly to your Pi-hole instance

## Configuration Options

You can customize the widget behavior by editing the script:
- PIHOLE_BASE – Pi-hole URL or IP address
- REFRESH_HOURS – refresh hint interval
- Widget layouts in buildSmall, buildMedium, buildLarge
- Displayed metrics via mapToWidgetFields

## Limitations
- Widget refresh timing is controlled by iOS; Scriptable only provides a refresh hint
- The hostname pi.hole may not resolve on all networks — using the IP address is recommended
- Update checks for Pi-hole components are not implemented (yet)

## Contributing

Pull requests and suggestions are welcome.
Please keep changes focused and document behavior changes clearly.
