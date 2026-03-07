# Chess As God Intended

Are you a fan of chess but are sick of the better player always winning? Have you sacrificed your soul to the RNG gods but aren't seeing a return on investment? Well this is the game for you!

## How The Game Works

### Start, Load, and Save Slots

- When the app opens, it asks you to **Name the Game**.
- That name is used as the Firebase save slot key.
- If the name already exists in Firebase, that game is loaded.
- If it does not exist, a new save slot is created for that name.
- Press **Submit** at any time to save to the currently selected named slot.

### Core Rules

- Standard chess movement and win conditions are the base.
- **En passant is forced** when available.
- Stage hazards and beneficial effects can override normal chess movement and capture rules.

### Turn and Chaos Flow

- The game tracks full turns (`White + Black = 1 full turn`).
- Every 3rd full turn, a random **Stage Hazard** activates for 3 turns.
- After a player finishes a move, they have a 25% chance to receive an **effect draft**.
- Effect draft: choose 1 of 3 random beneficial effects.
- Most effects expire after a set duration in turns.
- Persistent effects (`Royal Mercy`, `Lucky Promotion`) last until consumed.
- Stage Hazards override other effects unless otherwise stated.

### UI and Controls

- Click a piece, then click a highlighted legal square.
- **Reset Game** resets to standard initial setup.
- **Empty Board** clears all pieces.
- **Submit** saves to Firebase.
- Dev mode: type `waluigi` to toggle board editor mode.
- Dev injector: press `\` and enter an effect ID (`1-50`) or hazard ID (`51-100`).

## Beneficial Effects (1-50)

| ID | Name | Duration | What It Does |
| --- | --- | --- | --- |
| 1 | Rook Rocket | 3 | Rooks may jump past one blocker on straight lines. |
| 2 | Knight Relay | 2 | Knights also get extended 3-1 leaps. |
| 3 | Bishop Drift | 4 | Bishops can also move one square orthogonally. |
| 4 | Queen Shield | 3 | Enemy pawns cannot capture your queen. |
| 5 | Pawn Sprint | 2 | Pawns may move two squares from any rank if clear. |
| 6 | Fortress File | 3 | Rooks can also move one square diagonally. |
| 7 | Royal Glide | 2 | King may move two squares orthogonally. |
| 8 | Ghost Pawns | 2 | Pawns can hop through a blocked first forward square. |
| 9 | Archer Bishops | 3 | Bishops can capture one square orthogonally. |
| 10 | Heavy Queen | 4 | Enemy queen cannot capture your queen. |
| 11 | Knight Warp | 2 | Knights can teleport to any empty opposite-color square. |
| 12 | Lucky Castle | 1 | Castling rights loss is ignored this turn from home square. |
| 13 | Pawn Armor | 3 | Your pawns cannot be captured. |
| 14 | Rook Magnet | 2 | Rooks can capture adjacent diagonal pieces. |
| 15 | Bishop Tunnel | 3 | Bishops can pass through one blocker on diagonals. |
| 16 | Queen Echo | 2 | Queen also gains knight jumps. |
| 17 | Knight Net | 2 | Enemy king cannot move to squares near your knights. |
| 18 | Royal Guard | 3 | Pieces next to your king are immune to bishop/knight captures. |
| 19 | Pawn Factory | 1 | Pawns promote early when reaching the fifth rank. |
| 20 | Backline Boost | 3 | Back-rank pieces can step one square forward if empty. |
| 21 | Diagonal Charge | 2 | Pawns may move diagonally into empty squares. |
| 22 | Iron Rook | 4 | Enemy pawns cannot capture your rooks. |
| 23 | Bishop Beam | 2 | Bishops can capture by jumping over one enemy on a diagonal. |
| 24 | Queen Leap | 3 | Queen can pass through one blocker on straight lines. |
| 25 | Knight Armor | 3 | Your knights cannot be captured. |
| 26 | Pawn Recall | 2 | Pawns can move backward one square if empty. |
| 27 | Royal Blessing | 3 | King may move diagonally like bishops. |
| 28 | Rook Slide | 3 | Rooks gain one-square diagonal movement. |
| 29 | Bishop Burst | 2 | Bishops can pass through up to two blockers on diagonals. |
| 30 | Queen Split | 2 | Queen moves can chain a one-square orthogonal step. |
| 31 | Knight Charge | 2 | Knight captures grant an immediate extra knight move. |
| 32 | Pawn Web | 3 | Pawns also attack and capture directly forward. |
| 33 | Tempo Surge | 1 | Instantly grants a bonus turn. |
| 34 | Safe Passage | 3 | First move each turn cannot be captured on next enemy move. |
| 35 | Rook Barricade | 3 | Squares next to your rooks are forbidden for enemy kings. |
| 36 | Divine Blessing | 1 | Bishops behave as queens for 1 turn. |
| 37 | Queen Recovery | 2 | Captured queen returns to home square if empty. |
| 38 | Knight Ladder | 3 | Knights can also move one square diagonally. |
| 39 | Pawn Reinforce | 3 | Pawns with file support cannot be captured by pawns. |
| 40 | King Swap | 2 | King may swap with adjacent friendly piece. |
| 41 | Rook Overdrive | 2 | Non-capturing rook moves grant immediate extra rook move. |
| 42 | Bishop Echo | 2 | A bishop move also nudges another bishop the same direction. |
| 43 | Queen Fortress | 2 | Enemy queens cannot capture your queen. |
| 44 | Knight Pivot | 3 | Knights can also move one square in any direction. |
| 45 | Pawn Storm | 1 | Pawns gain one extra forward step this turn. |
| 46 | Royal Mercy | Until used | Persists until it prevents your next checkmate once. |
| 47 | Rook Chain | 4 | Rooks linked on same rank/file gain capture protection. |
| 48 | Bishop Prism | 2 | Bishops can step one orthogonal square to switch color parity. |
| 49 | Queen Momentum | 3 | Queen captures grant immediate extra pawn move. |
| 50 | Lucky Promotion | Until used | Persists until your next promotion, then spawns a bonus knight. |

## Stage Hazards (51-100)

| ID | Name | What It Does |
| --- | --- | --- |
| 51 | Heavenly Freeze | All bishops cannot move. |
| 52 | Horse Toxins | All knights cannot capture. |
| 53 | Rook Traffic | Rooks can only move up to 3 squares. |
| 54 | Income Inequality | Queens can only move to capture. |
| 55 | Pawn Truce | Pawns cannot capture each other. |
| 56 | Royal Curfew | Kings cannot move to edge files (a or h). |
| 57 | Nyctophobia | No piece may end a move on dark squares. |
| 58 | Photophobia | No piece may end a move on light squares. |
| 59 | Center Lock | No piece may move into d4, e4, d5, or e5. |
| 60 | Edge Lock | Pieces on edge files cannot move. |
| 61 | Truce | No captures are allowed. |
| 62 | Heavy Board | All non-knight pieces move at most 2 squares. |
| 63 | Determination | Pieces may not move backwards. |
| 64 | Fog Files | Pieces on c and f files cannot leave the file. |
| 65 | Crosswind | Only bishops may move diagonally. |
| 66 | Mud Ranks | Pieces on rank 4 and 5 cannot move. |
| 67 | Budget Cuts | Pawns cannot promote. |
| 68 | Guard Lock | Castling is disabled for both players. |
| 69 | Nostalgia Bait | Remove all active effects for both players. Players cannot get new effects. |
| 70 | Capture Cooldown | Any piece that captures cannot move next turn. |
| 71 | Bergentruckung | All kings can move like queens. |
| 72 | Defensive Ranks | Pieces on rank 2 and 7 cannot be captured. |
| 73 | Women's Equality | Queens move like kings only. |
| 74 | Heavy Horseshoes | Knights may not jump; they move one square orthogonally. |
| 75 | Church Tithes | Pieces adjacent to bishops may not move. |
| 76 | Cowardly Pawns | Pawns may move only backward one square. |
| 77 | Tilted Towers | Rooks can only move diagonally one square. |
| 78 | Racist Knights | Knights can only move to light squares. |
| 79 | Royal Pacifism | Queens and kings cannot capture. |
| 80 | Pawn Empowerment | If a pawn captures a piece, it must promote to that piece. |
| 81 | Chaos Vortex of Devastating Horrors | En passant is not allowed. |
| 82 | Monotony | All pieces can only move like pawns. |
| 83 | Rook Slide | After a rook captures a piece, it will move one more space in the direction it was going. |
| 84 | Horse Riding | Kings can move like knights. |
| 85 | Frostbite | At each turn start, one piece type is frozen for both players. |
| 86 | Minefield | 3 mines are placed on empty board squares. Pieces landing on them are captured. |
| 87 | Pawn Ceiling | Pawns cannot move beyond rank 5 (white) or rank 4 (black). |
| 88 | Sticky Mines | 3 mines are placed on the board. Pieces on or adjacent to them cannot move. |
| 89 | Uno Reverse | If a player gets checkmated, they win. |
| 90 | Female Empowerment | The queen cannot move only one space. |
| 91 | Color Lock | Pieces must remain on the color of square they started from. |
| 92 | Lame Victory | If checkmated, the game ends in a stalemate instead. |
| 93 | Knight's Armor | Knights cannot be captured. |
| 94 | Church Mass | Bishops must move exactly 2 squares. |
| 95 | Road Work Ahead | Rooks must move exactly 2 squares. |
| 96 | Rook Evolution | Rooks move like queens. |
| 97 | Catholic Church | Bishops move like queens. |
| 98 | Scaredy King | Friendly pieces may not move next to their king. |
| 99 | Meteor Shower | Random empty square becomes blocked each turn. |
| 100 | Bloodlust | If no capture occurs in 3 turns, game auto-declares draw. |

