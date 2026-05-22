# Reverse Tower Defense — Game Flow

# 1. Main Lobby

The player enters the lobby and chooses:

```text
Join Existing Room
Create New Room
```

---

# 2. Create Room

The host selects:

```text
Difficulty
Room Visibility
```

Available difficulties:

```text
Easy
Normal
Hard
```

The difficulty determines:

```text
Map pool
Tower count
Tower strength
Enemy modifiers
Starting gold
Maximum unit types
Wave scaling
Reward multiplier
```

---

# 3. Map Selection

After the difficulty is selected, the game randomly selects a map from the corresponding difficulty pool.

Example:

```text
Easy Pool:
- Forest Pass
- Grassland Route
- Broken Bridge

Normal Pool:
- Canyon Siege
- Twin Rivers
- Frozen Path

Hard Pool:
- Fortress Valley
- Inferno Crossing
- Blackstone Keep
```

Each map is handcrafted and fully balanced.

---

# 4. Difficulty Scaling

Difficulty affects the gameplay systems directly.

---

## Easy

Designed for beginners.

### Effects

```text
Fewer towers
Lower tower HP
Lower tower damage
More starting gold
Slower wave scaling
Higher healing/resource drops
```

### Example

```text
Tower HP: -20%
Tower Damage: -15%
Starting Gold: 300
Max Unit Types: 6
Reward Multiplier: 1.0x
```

---

## Normal

Standard balanced experience.

### Effects

```text
Standard tower layouts
Balanced economy
Standard scaling
```

### Example

```text
Tower HP: 100%
Tower Damage: 100%
Starting Gold: 250
Max Unit Types: 5
Reward Multiplier: 1.25x
```

---

## Hard

Designed for experienced players.

### Effects

```text
More towers
Elite tower variants
Less starting gold
More dangerous wave scaling
More tower synergies
```

### Example

```text
Tower HP: +35%
Tower Damage: +25%
Starting Gold: 200
Max Unit Types: 4
Reward Multiplier: 1.75x
```

---

# 5. Room Setup

Both players enter the room.

The room now displays:

```text
Selected Difficulty
Selected Map
Map Preview
Difficulty Modifiers
Reward Multiplier
```

---

# 6. Unit Type Selection

Both players select their unit types.

The number of available slots is determined by difficulty.

Example:

```text
Easy: 6 unit types
Normal: 5 unit types
Hard: 4 unit types
```

This increases strategic decision-making on higher difficulties.

---

# 7. Wave 1 Deployment

Each player receives starting gold based on difficulty.

Players create their Wave 1 queue using only their selected unit types.

Example:

```text
Player 1:
Knight → Archer → Priest

Player 2:
Soldier → Soldier → Bomber
```

---

# 8. Start Battle

When both players lock in:

```text
Wave 1 begins
```

Units from both players enter the battlefield together.

---

# 9. Battle Phase

During battle:

```text
Units move
Towers attack
Units destroy towers
Players gain resources
Players collect temporary rewards
```

Difficulty affects:

```text
Tower stats
Tower combinations
Wave intensity
Enemy modifiers
```

---

# 10. Between Waves

After each wave:

```text
Players spend resources
Buy units
Upgrade units
Prepare next wave
Adjust strategy
```

Then both players lock in again.

---

# 11. Final Objective

The team wins when the map objective is completed.

Possible objectives:

```text
Destroy Fortress Core
Destroy all towers
Escort units to the end
Survive final wave
```

---

# 12. Reward Distribution

Both players receive rewards.

The player with higher contribution receives bonus rewards.

Contribution is calculated using:

```text
Damage dealt
Towers destroyed
Units survived
Healing/support value
Special objective contribution
```

---

# 13. Return to Lobby

After victory or defeat:

```text
Show statistics
Show rewards
Unlock progression
Return to lobby
```

---

# Full Flow Summary

```text
Main Lobby
↓
Create or Join Room
↓
Host Selects Difficulty
↓
Map Is Selected From Difficulty Pool
↓
Two Players Connect
↓
Both Players Select Unit Types
↓
Both Players Prepare Wave 1
↓
Start Battle
↓
Fight Wave
↓
Earn Resources
↓
Prepare Next Wave
↓
Repeat Until Final Objective
↓
Victory or Defeat
↓
Rewards Distributed
↓
Return to Lobby
```

---

# Design Philosophy

This game focuses on:

```text
Co-op strategy
Army composition
Wave planning
Resource management
Team coordination
```

Replayability comes from:

```text
Different handcrafted maps
Different difficulty modifiers
Different team compositions
Different upgrades
Different wave strategies
```

Instead of procedural generation, the game uses handcrafted maps combined with dynamic difficulty scaling and strategic variability.

