# Icon Library Migration Analysis: Tabler → Phosphor or Lucide

## Context

tribos.studio currently uses **@tabler/icons-react** exclusively for UI icons (175 unique icons across ~130 files). The project previously used Lucide (evidence in `OLD/` directory with 50+ files). This analysis catalogs every icon in use and maps equivalents in Phosphor and Lucide to assess migration feasibility.

## Current Usage Summary

- **175 unique Tabler icons** used across the `src/` directory
- **~130 files** import from `@tabler/icons-react`
- **4 custom inline SVGs** (weather arrow, bike infra legend, elevation chart, analyze step) — unaffected by migration
- **1 custom brand SVG** (Strava logo) — unaffected

### Top 20 Icons by Usage Frequency

| Icon | Uses | Category |
|------|------|----------|
| IconCheck | 159 | UI/feedback |
| IconRoute | 90 | Domain-specific |
| IconRefresh | 81 | Action |
| IconClock | 77 | Time |
| IconFlame | 68 | Fitness |
| IconActivity | 68 | Fitness |
| IconChevronDown | 65 | Navigation |
| IconChevronRight | 59 | Navigation |
| IconAlertTriangle | 59 | Feedback |
| IconAlertCircle | 59 | Feedback |
| IconTrendingUp | 58 | Data |
| IconTrash | 54 | Action |
| IconBike | 52 | Domain-specific |
| IconTrophy | 51 | Achievement |
| IconPlus | 51 | Action |
| IconTarget | 49 | Goals |
| IconMountain | 48 | Domain-specific |
| IconSparkles | 47 | AI/magic |
| IconCalendar | 44 | Time |
| IconBolt | 44 | Power/energy |

## Complete Icon Mapping (175 icons)

### Legend
- ✅ = Direct equivalent exists
- ⚠️ = Close equivalent (slightly different name/style)
- ❌ = No equivalent, would need custom SVG or alternative

### UI / Navigation Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconArrowBack | ArrowLeft | ArrowLeft | ✅ Both |
| IconArrowDown | ArrowDown | ArrowDown | ✅ Both |
| IconArrowForward | ArrowRight | ArrowRight | ✅ Both |
| IconArrowLeft | ArrowLeft | ArrowLeft | ✅ Both |
| IconArrowRight | ArrowRight | ArrowRight | ✅ Both |
| IconArrowUp | ArrowUp | ArrowUp | ✅ Both |
| IconArrowsExchange | ArrowLeftRight | ArrowsLeftRight | ✅ Both |
| IconChevronDown | ChevronDown | CaretDown | ✅ Both |
| IconChevronLeft | ChevronLeft | CaretLeft | ✅ Both |
| IconChevronRight | ChevronRight | CaretRight | ✅ Both |
| IconChevronUp | ChevronUp | CaretUp | ✅ Both |
| IconCheck | Check | Check | ✅ Both |
| IconCircle | Circle | Circle | ✅ Both |
| IconCircleCheck | CheckCircle | CheckCircle | ✅ Both |
| IconClick | MousePointerClick | CursorClick | ✅ Both |
| IconDotsVertical | MoreVertical / EllipsisVertical | DotsThreeVertical | ✅ Both |
| IconExternalLink | ExternalLink | ArrowSquareOut | ✅ Both |
| IconGripVertical | GripVertical | DotsSixVertical | ✅ Both |
| IconHandClick | MousePointerClick | HandTap | ✅ Both |
| IconHome | Home | House | ✅ Both |
| IconLayoutGrid | LayoutGrid | SquaresFour | ✅ Both |
| IconLayoutList | LayoutList | List | ✅ Both |
| IconList | List | List | ✅ Both |
| IconMinus | Minus | Minus | ✅ Both |
| IconPlus | Plus | Plus | ✅ Both |
| IconPointer | Pointer | Cursor | ✅ Both |
| IconSearch | Search | MagnifyingGlass | ✅ Both |
| IconSelector | ChevronsUpDown | CaretUpDown | ✅ Both |
| IconX | X | X | ✅ Both |

### Action Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconArchive | Archive | Archive | ✅ Both |
| IconCloudDownload | CloudDownload | CloudArrowDown | ✅ Both |
| IconCloudUpload | CloudUpload | CloudArrowUp | ✅ Both |
| IconCopy | Copy | Copy | ✅ Both |
| IconDeviceFloppy | Save | FloppyDisk | ✅ Both |
| IconDownload | Download | Download | ✅ Both |
| IconEdit | Edit / Pencil | PencilSimple | ✅ Both |
| IconFilter | Filter | Funnel | ✅ Both |
| IconFilterOff | FilterX | FunnelX | ⚠️ Phosphor: FunnelSimpleX |
| IconFolderOpen | FolderOpen | FolderOpen | ✅ Both |
| IconLink | Link | Link | ✅ Both |
| IconLock | Lock | Lock | ✅ Both |
| IconLockOpen | LockOpen | LockOpen | ✅ Both |
| IconPencil | Pencil | Pencil | ✅ Both |
| IconPhoto | Image | Image | ✅ Both |
| IconPin | Pin | PushPin | ✅ Both |
| IconRefresh | RefreshCw | ArrowsClockwise | ✅ Both |
| IconRefreshDot | RefreshCwDot | ArrowClockwise | ⚠️ Phosphor approximate |
| IconRepeat | Repeat | Repeat | ✅ Both |
| IconScissors | Scissors | Scissors | ✅ Both |
| IconSend | Send | PaperPlaneRight | ✅ Both |
| IconSettings | Settings | Gear | ✅ Both |
| IconShare | Share | ShareNetwork | ✅ Both |
| IconTrash | Trash2 | Trash | ✅ Both |
| IconUpload | Upload | Upload | ✅ Both |

### Feedback / Status Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconAlertCircle | AlertCircle | WarningCircle | ✅ Both |
| IconAlertTriangle | AlertTriangle / TriangleAlert | Warning | ✅ Both |
| IconBug | Bug | Bug | ✅ Both |
| IconBulb | Lightbulb | Lightbulb | ✅ Both |
| IconEye | Eye | Eye | ✅ Both |
| IconEyeCheck | EyeCheck | EyeSlash (inverted) | ⚠️ Phosphor: no exact EyeCheck |
| IconEyeOff | EyeOff | EyeSlash | ✅ Both |
| IconInfoCircle | Info | Info | ✅ Both |
| IconMoodHappy | Smile | Smiley | ✅ Both |
| IconMoodSad | Frown | SmileyXEyes | ⚠️ Phosphor approximate |
| IconMoodSmile | Smile | Smiley | ✅ Both |
| IconPoint | Dot / Circle | Circle | ✅ Both |
| IconQuestionMark | HelpCircle | Question | ✅ Both |
| IconShield | Shield | Shield | ✅ Both |
| IconShieldCheck | ShieldCheck | ShieldCheck | ✅ Both |

### Communication Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconMail | Mail | Envelope | ✅ Both |
| IconMailOpened | MailOpen | EnvelopeOpen | ✅ Both |
| IconMessage | MessageSquare | ChatDots | ✅ Both |
| IconMessageCheck | MessageSquareCheck | ChatCheck | ⚠️ Phosphor: approximate |
| IconMessageCircle | MessageCircle | ChatCircle | ✅ Both |

### Time / Calendar Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconCalendar | Calendar | Calendar | ✅ Both |
| IconCalendarEvent | CalendarDays | CalendarBlank | ✅ Both |
| IconCalendarOff | CalendarOff | CalendarX | ✅ Both |
| IconCalendarPlus | CalendarPlus | CalendarPlus | ✅ Both |
| IconCalendarStats | CalendarRange | CalendarCheck | ⚠️ Phosphor approximate |
| IconClock | Clock | Clock | ✅ Both |
| IconClockMinus | ClockMinus (v0.400+) | ClockCountdown | ⚠️ Both approximate |
| IconClockPlus | ClockPlus (v0.400+) | ClockClockwise | ⚠️ Both approximate |
| IconHistory | History | ClockCounterClockwise | ✅ Both |

### Data / Charts Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconChartAreaLine | AreaChart | ChartLine | ⚠️ Both approximate |
| IconChartBar | BarChart3 | ChartBar | ✅ Both |
| IconChartLine | LineChart | ChartLine | ✅ Both |
| IconChartPie | PieChart | ChartPie | ✅ Both |
| IconTrendingDown | TrendingDown | TrendDown | ✅ Both |
| IconTrendingUp | TrendingUp | TrendUp | ✅ Both |

### Fitness / Sports Domain Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconActivity | Activity | Activity / Heartbeat | ✅ Both |
| IconBarbell | Dumbbell | Barbell | ✅ Both |
| IconBike | Bike | Bicycle | ✅ Both |
| IconBolt | Zap | Lightning | ✅ Both |
| IconFlame | Flame | Fire | ✅ Both |
| IconHeart | Heart | Heart | ✅ Both |
| IconHeartRateMonitor | HeartPulse | Heartbeat | ⚠️ Both approximate |
| IconHeartbeat | HeartPulse | Heartbeat | ✅ Both |
| IconMountain | Mountain | Mountains | ✅ Both |
| IconRun | PersonStanding (no run) | PersonSimpleRun | ⚠️ Lucide: no running icon; Phosphor: ✅ |
| IconScale | Scale | Scales | ✅ Both |
| IconStretching | Stretch (none) | PersonSimpleWalk | ❌ Lucide: none; ⚠️ Phosphor approximate |
| IconTarget | Target | Target / Crosshair | ✅ Both |
| IconTargetArrow | Target | Target | ⚠️ Both (no arrow variant) |
| IconTrophy | Trophy | Trophy | ✅ Both |
| IconYoga | — | — | ❌ Neither has yoga icon |
| IconAward | Award | Medal | ✅ Both |
| IconCrown | Crown | Crown | ✅ Both |

### Weather / Nature Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconCloud | Cloud | Cloud | ✅ Both |
| IconDroplet | Droplet | Drop | ✅ Both |
| IconMoon | Moon | Moon | ✅ Both |
| IconSun | Sun | Sun | ✅ Both |
| IconSunHigh | Sun | SunDim | ⚠️ Both approximate |
| IconTemperature | Thermometer | Thermometer | ✅ Both |
| IconThermometer | Thermometer | Thermometer | ✅ Both |
| IconTree | TreePine | Tree | ✅ Both |
| IconWind | Wind | Wind | ✅ Both |
| IconZzz | — | Zzz | ❌ Lucide: none; ✅ Phosphor |

### Map / Location Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconCompass | Compass | Compass | ✅ Both |
| IconCurrentLocation | LocateFixed | Crosshair / NavigationArrow | ✅ Both |
| IconFocus2 | Focus | Crosshair | ⚠️ Both approximate |
| IconMap | Map | MapTrifold | ✅ Both |
| IconMapOff | MapOff | MapTrifold (no off variant) | ⚠️ Phosphor: no off variant |
| IconMapPin | MapPin | MapPin | ✅ Both |
| IconRoute | Route | Path | ✅ Lucide; ⚠️ Phosphor (Path is close) |
| IconRoad | Route | Road | ✅ Both |

### Technology / Device Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconBrandApple | Apple | AppleLogo | ✅ Both |
| IconBrandGoogle | — | GoogleLogo | ❌ Lucide: none; ✅ Phosphor |
| IconBrandSpeedtest | Gauge | Speedometer | ⚠️ Both approximate |
| IconBrandStrava | — | — | ❌ Neither (custom SVG needed) |
| IconBrandZwift | — | — | ❌ Neither (custom SVG needed) |
| IconCamera | Camera | Camera | ✅ Both |
| IconDeviceWatch | Watch | Watch | ✅ Both |
| IconPlugConnected | Plug | Plug | ✅ Both |
| IconWebhook | Webhook | Webhook | ✅ Both (Lucide has it) |

### AI / Special Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconBrain | Brain | Brain | ✅ Both |
| IconRobot | Bot | Robot | ✅ Both |
| IconSparkles | Sparkles | Sparkle | ✅ Both |
| IconWand | Wand2 | MagicWand | ✅ Both |

### Food / Nutrition Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconApple | Apple | Apple | ✅ Both |
| IconBottle | — | Bottle | ❌ Lucide: none; ✅ Phosphor |
| IconCoffee | Coffee | Coffee | ✅ Both |
| IconMeat | Beef | — | ⚠️ Lucide: Beef; ❌ Phosphor: none |
| IconToolsKitchen2 | UtensilsCrossed | ForkKnife | ✅ Both |

### File / Document Icons

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconFile | File | File | ✅ Both |
| IconFileCode | FileCode | FileCode | ✅ Both |
| IconFileExport | FileOutput | FileArrowUp | ✅ Both |
| IconFileImport | FileInput | FileArrowDown | ✅ Both |
| IconFileSpreadsheet | FileSpreadsheet | FileXls | ✅ Both |
| IconFileText | FileText | FileText | ✅ Both |
| IconFileZip | FileArchive | FileZip | ✅ Both |
| IconFiles | Files | Files | ✅ Both |

### Miscellaneous

| Tabler Icon | Lucide Equivalent | Phosphor Equivalent | Notes |
|---|---|---|---|
| IconAdjustments | SlidersHorizontal | Sliders | ✅ Both |
| IconBattery | Battery | Battery | ✅ Both |
| IconColor | Palette | Palette | ✅ Both |
| IconComponent | Component | Cube | ⚠️ Both approximate |
| IconDoor | DoorOpen | Door | ✅ Both |
| IconDoorExit | LogOut | SignOut | ✅ Both |
| IconFlag | Flag | Flag | ✅ Both |
| IconGauge | Gauge | Gauge | ✅ Both |
| IconPlayerPause | Pause | Pause | ✅ Both |
| IconPlayerPlay | Play | Play | ✅ Both |
| IconRocket | Rocket | Rocket | ✅ Both |
| IconRuler | Ruler | Ruler | ✅ Both |
| IconSize | Maximize | ArrowsOut | ⚠️ Both approximate |
| IconStar | Star | Star | ✅ Both |
| IconStarFilled | Star (fill prop) | Star (weight="fill") | ✅ Both (via props) |
| IconTemplate | LayoutTemplate | Layout | ⚠️ Both approximate |
| IconTestPipe | TestTube | TestTube | ✅ Both |
| IconThumbUp | ThumbsUp | ThumbsUp | ✅ Both |
| IconTiltShift | Focus | — | ⚠️ Lucide approximate; ❌ Phosphor |
| IconTool | Wrench | Wrench | ✅ Both |
| IconUser | User | User | ✅ Both |
| IconUserCheck | UserCheck | UserCheck | ✅ Both |
| IconUserOff | UserX | UserMinus | ⚠️ Both approximate |
| IconUsers | Users | Users | ✅ Both |
| IconWheel | Circle (no wheel) | Tire | ⚠️ Lucide: none; ⚠️ Phosphor approximate |

## Compatibility Summary

| Metric | Lucide | Phosphor |
|--------|--------|----------|
| **Direct match (✅)** | ~155 / 175 (89%) | ~152 / 175 (87%) |
| **Close equivalent (⚠️)** | ~14 / 175 (8%) | ~16 / 175 (9%) |
| **Missing (❌)** | ~6 / 175 (3%) | ~7 / 175 (4%) |

### Icons missing from Lucide (need custom SVG)
1. **IconBrandGoogle** — no brand icons in Lucide (use custom SVG)
2. **IconBrandStrava** — no brand icons (already custom SVG in codebase)
3. **IconBrandZwift** — no brand icons
4. **IconBottle** — no bottle icon
5. **IconZzz** — no sleep/zzz icon
6. **IconStretching** — no stretching/yoga icon
7. **IconYoga** — no yoga icon

### Icons missing from Phosphor (need custom SVG)
1. **IconBrandStrava** — no Strava brand icon (already custom SVG)
2. **IconBrandZwift** — no Zwift brand icon
3. **IconMeat** — no meat/beef icon
4. **IconYoga** — no yoga icon
5. **IconTiltShift** — no tilt-shift icon
6. **IconMapOff** — no map-off variant
7. **IconEyeCheck** — no eye-check variant

## Library Comparison

| Factor | Lucide | Phosphor |
|--------|--------|----------|
| **Icon count** | ~1,500+ | ~1,200+ (6 weights each) |
| **Bundle size** | Tree-shakeable, ~0.5KB per icon | Tree-shakeable, ~0.5KB per icon |
| **React package** | `lucide-react` | `@phosphor-icons/react` |
| **Style weights** | Single stroke style | 6 weights: thin, light, regular, bold, fill, duotone |
| **Customization** | size, color, strokeWidth | size, color, weight, mirrored |
| **TypeScript** | Full TS support | Full TS support |
| **Naming** | PascalCase (e.g., `<Check />`) | PascalCase (e.g., `<Check />`) |
| **Brand icons** | None (policy) | Some (Google, Apple, etc.) |
| **Fitness domain** | Weaker (no Run icon) | Stronger (PersonSimpleRun, Barbell, Bicycle) |
| **Prior use** | Was used before (in OLD/ directory) | Never used |

## Recommendation

**Phosphor is the better fit** for this cycling training app because:
1. **6 weight variants** (thin→fill + duotone) give more design flexibility without extra icons
2. **Better fitness/sports coverage**: `PersonSimpleRun`, `Barbell`, `Bicycle`, `Bottle` are all native
3. **Brand icons included**: GoogleLogo, AppleLogo save custom SVG work
4. **Duotone weight** matches the "retro-futuristic field guide" design language well

**Lucide is the safer/simpler choice** because:
1. Previously used in this codebase (familiarity)
2. Larger icon set overall
3. Simpler API (one style, strokeWidth control)
4. More actively maintained (higher GitHub activity)

## Migration Effort Estimate

- **~130 files** need import changes
- **175 icon name mappings** to apply (could be largely automated with codemod/find-replace)
- **6-7 custom SVGs** needed regardless of library choice
- **Migration approach**: Create an `icons.ts` barrel file that re-exports library icons with Tabler names → swap imports → then rename to native names over time

## Verification

After migration:
1. `grep -r "@tabler/icons-react" src/` should return zero results
2. Visual review of all pages for icon rendering
3. Bundle size comparison before/after (`npm run build` + check chunk sizes)
4. Run `npm run test:run` to catch any broken imports
