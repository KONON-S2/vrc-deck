<div align="center">
  <img src="com.konon.vrc-deck.sdPlugin/imgs/plugin/vrc-deck-main.svg" width="160" alt="VRC Deck logo">

  # VRC Deck

  Control and monitor VRChat from your Stream Deck using OSC and the VRChat API.
</div>

> VRC Deck is an unofficial community project. It is not affiliated with or endorsed by VRChat Inc. or Elgato.

## Features

| Action | Description | VRC Login |
| --- | --- | :---: |
| Mic Toggle | Toggle the microphone and synchronize its current state in real time. | No |
| AFK Status | Display the current VRChat AFK state. | No |
| VRC Login | Sign in for actions that use the VRChat API. | — |
| Instance Status | Display player count or world name with an optional world thumbnail. | Yes |
| Avatar Change | Search your available avatars and switch to the selected avatar. | Yes |
| Current Avatar | Display the name and thumbnail of the currently equipped avatar. | Yes |
| Avatar Height Increase | Increase eye height once or continuously while the key is held. | No |
| Avatar Height Decrease | Decrease eye height once or continuously while the key is held. | No |
| Avatar Height Set | Set eye height directly to a configured value. | No |
| Online Status | Cycle, toggle, or set your VRChat online status. | Yes |
| Expression Toggle | Toggle a Bool avatar expression parameter. | No |
| Expression Button | Set a Bool, Int, or Float expression parameter to a configured value. | No |
| Expression Cycle | Cycle an Int expression parameter through a configured range. | No |
| Expression Increase / Decrease | Adjust numeric expression parameters, including hold-to-repeat. | No |
| Auto Chat | Send a saved message directly to the VRChat chatbox. | No |
| Panic Button | Turn on VRChat Safe Mode. | No |

## Requirements

- Windows 10 or later
- Stream Deck 7.1 or later
- VRChat for PC
- VRChat OSC enabled for OSC-based actions
- Internet access and VRC Login for VRChat API actions

Stream Deck + dial controls are not currently supported.

## Installation

1. Download the latest `.streamDeckPlugin` file from [GitHub Releases](https://github.com/KONON-S2/vrc-deck/releases/latest).
2. Open the downloaded file.
3. Confirm the installation in the Stream Deck app.
4. Find **VRC Deck** in the action list and add the actions you want to use.

## Enable OSC in VRChat

1. Start VRChat.
2. Open the Action Menu.
3. Go to **Options → OSC**.
4. Enable OSC.

VRC Deck automatically discovers VRChat through OSCQuery and uses VRChat's default OSC input and output interfaces.

## VRC Login

Some actions need access to your VRChat account data, including avatar selection, current avatar information, instance information, and online status controls.

1. Add the **VRC Login** action to a Stream Deck key.
2. Enter your VRChat username or email and password in the Property Inspector.
3. Complete two-factor authentication if requested.
4. After a successful login, the password fields can be cleared.

The plugin does not retain the entered password. It stores an encrypted VRChat session locally in Stream Deck global settings so the session can be restored after restarting Stream Deck. Session data is sent only to the VRChat API.

## Expression Parameters

Expression actions load the parameters of the currently equipped avatar. Select a parameter from the searchable list, then configure the action according to its type.

- Bool parameters can be toggled or set to `true` or `false`.
- Int parameters can be set, cycled, increased, or decreased.
- Float parameters use values from `0.00` to `1.00` for standard avatar expression controls.

If the parameter list is empty, confirm that OSC is enabled and reload or switch your avatar once.

## Avatar Height

Avatar height actions use VRChat's `/avatar/eyeheight` OSC endpoint. The plugin retrieves the current height through OSCQuery after startup and listens for later changes.

- Increase default maximum: `5.0 m`
- Decrease default minimum: `0.2 m`
- Supported configuration range: `0.1–100 m`

Worlds can restrict or disable avatar scaling. In that case, VRChat may ignore a requested height or apply a different value.

## Important Notes

- **Panic Button only enables Safe Mode.** Disable Safe Mode from the VRChat Quick Menu.
- VRChat does not expose the current Safe Mode state through OSC, so VRC Deck cannot display whether Safe Mode is active.
- Instance and avatar thumbnails are downloaded when needed and cached in plugin memory. They are not saved as separate image files by VRC Deck.
- API actions may stop working when the VRChat session expires. Use VRC Login again to restore access.

## Development

Install dependencies:

```powershell
npm install
```

Build continuously and restart the plugin after each build:

```powershell
npm run watch
```

Create a production build:

```powershell
npm run build
```

Validate the plugin:

```powershell
npx streamdeck validate com.konon.vrc-deck.sdPlugin --no-update-check
```

Create an installable package:

```powershell
npx streamdeck pack com.konon.vrc-deck.sdPlugin --no-update-check
```

## Support

Report problems through the [GitHub repository](https://github.com/KONON-S2/vrc-deck).

When reporting a problem, include the affected action, Stream Deck version, VRChat mode (Desktop or VR), and the steps required to reproduce it. Do not include your password, session data, or other private account information.
