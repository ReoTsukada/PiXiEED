---
document_id: PIXIGAME-MULTI-LANGUAGE-SCRIPTING-001
status: CANONICAL
version: 2.2.0
verified_at: 2026-08-10
---

# PiXiGame 多言語スクリプト仕様 {#pixigame-scripting}

## 方針

PiXiGameは単一言語を強制しない。ノーコード/Event Sheet/Visual Graphはコード不要、標準Web RuntimeはTypeScript、UnityはC#、UnrealはC++、GodotはGDScriptまたはC#、軽量Mod・イベントはLua候補、高性能内部処理はRust/WasmまたはC++/Wasmとする。Project作成・出力先選択時には提案するが、利用者は変更でき、ノーコードだけでも完成できる。

標準Runtimeの第一言語はTypeScriptとする。TypeScriptを使わないProjectに不要なRuntimeを強制読込しない。

## 言語別の責務

### C# / Unity

C#は正式Language Module。Unity ExportではMonoBehaviour、ScriptableObject、Input Action、Animator、Collider/Rigidbody、Scene、Prefab、Addressables、Gameplay Script、PiXiEED Asset metadataを生成でき、生成後のUnity編集を許可する。Web PreviewでC#を常時直接実行せず、制限Runtime、Cloud/Desktop PreviewまたはUnity Runtimeを使う。Mobileは対象PipelineのAOT・署名・互換性を検証する。

### C++ / Unreal

C++はUnreal Export、Native Plugin、Physics、AI、Pathfinding、画像音声処理、Platform Bridge、PC/Console、Custom Component、Wasmに限定して正式対応する。WorkspaceにはHighlight、補完、Symbol/Definition/Reference、Rename、Diagnostics、Build Log、Desktop Debug、Profiler、Test、Diff、Generated Headerを提供できるが、ブラウザで任意Native Binaryを直接実行しない。

Buildは `Source → 静的解析 → Capability検査 → Desktop/Cloud Build → Native Module/Wasm → 共通ABI` とする。WebはLLVM/Clang系からWasmへ変換しWorker/Sandboxで実行、Nativeは対象Toolchainと署名済みModuleを使う。UnrealではBehavior IR/ComponentからC++ Class・Blueprint接続雛形を生成する。

C++ BuildはProject単位で隔離し、Network/File/Process等をCapability制御、CPU/Memory/時間/出力容量を制限、DependencyをAllowlistまたはLockfile固定、Native Moduleを署名・Hash検証する。SecretをSource/Log/Artifactへ混入させず、Untrusted ModuleをPiXiEED本体ProcessへLoadせず、CrashからEditorを隔離する。

### Godot / Lua / Rust

Godot AdapterはGDScript/C#、Scene/Node/Resource、Input Map、AnimationPlayer、CollisionShapeを扱う。標準RuntimeへGDScript Engineを常時内蔵しない。Lua ModuleはQuest、会話、Mod、小規模AI、Event用とし、Sandbox、命令数・Memory制限、Capability、署名、API Allowlistを必須とする。RustはRaster、Codec、Deterministic Operation、Physics候補、Pathfinding、Compression、Package検証、Wasm Extension向けで、初心者向け通常イベント言語にはしない。

## Canonical Behavior IRと共通API

No-code/Event Sheet/Visual Graphの正本は言語別Sourceではなく `Canonical Behavior IR` とする。

```text
No-code / Event Sheet / Visual Graph
→ Canonical Behavior IR
→ Interpreter または TypeScript / C# / C++ / GDScript / Lua 生成・Compile
```

各言語でEntity、Component、System、Scene、Prefab、Input Action、Game Event、Variable、State、Timer、Animation、Audio、Physics、UI Control、Save Data、Network Messageの概念とIDを共有する。同じAction ID、Component ID、Variable IDを維持し、コードとGraphの二重実行にはOwnershipを付ける。

Behaviorを選択してTypeScript/C#/C++/GDScriptを表示できる。生成コードを `Custom Script` として複製した後はSourceが正本であり、任意コードを完全にIRへ逆変換することや自動上書きを保証しない。Custom FunctionはVisual GraphのCustom Nodeとして公開できる。

## 複数言語ProjectとManifest

一つのProjectで、例えばTypeScript(Web)、C#(Unity)、C++/Wasm(Pathfinding)、Lua(Quest)を併用できる。ただし循環依存、同一Componentの複数言語による二重正本、未定義ABIの直接Memory共有、Build先非対応言語の黙示実行、全Runtimeの一括読込を禁止する。

```ts
interface ScriptModuleManifest {
  moduleId: string;
  language: "typescript" | "csharp" | "cpp" | "gdscript" | "lua" | "rust_wasm";
  runtimeTarget: "pixigame_web" | "pixigame_desktop" | "unity" | "unreal" | "godot" | "native" | "wasm";
  entrypoints: string[];
  capabilities: string[];
  dependencies: Array<{ moduleId: string; version: string }>;
  buildProfileId?: string;
}
```

## Code WorkspaceとBuild Profile

WorkspaceはProject Files、TypeScript、C#、C++、Generated API、Build Profiles、Tests、Diagnostics、Logs、Profilerを持ち、File tree、Tabs、Search/Replace、Diff、Formatter、Lint、Type/Compile、Test、Build、Runtime log、Breakpoint、Watch、Call stack、Hot Reload、Generated比較、API docs、Permission/Capability inspectorを提供する。スマホは簡易編集、PCは完全Workspaceを基本とする。

Build ProfileはRuntime、Language、Dependency、Capabilityを保存する。例はWeb(TypeScript/C++ Wasm)、Unity(C#)、Unreal(C++)、Godot(GDScript/C#)。非対応言語がある場合は黙って削除せず、Wasm化、機能無効化、Desktop Build変更、詳細確認を提示する。

## 外部Adapterと販売境界

UnityはC#/Scene/Prefab/Input/Collider/Animator/Asset metadata、UnrealはC++/Blueprint/Actor/Component/Input/Collision/lineage、GodotはGDScriptまたはC#/Scene/Node/Input Map/Collision/Animationへ出力する。外部側で独自編集したものをPiXiGameへ完全自動逆同期すると誤認させない。

標準TypeScriptとNo-codeは基本機能。C# Adapter、C++ Adapter/Native Build、Godot、Lua、Cloud Compileは追加Module候補だが、ストアAdapterと重複販売せず、生成物・Build費・外部Engine費を分離表示する。

## Script Security

strict sandbox、raw DOM/任意Network/任意Filesystemの禁止、Capability manifest、CPU/時間/Memory budget、Deterministic API、Verified multiplayer/exportからunsafe API除外、Package署名・malware scan、拡張の明示Permissionを必須とする。

## 完成条件

- No-codeだけで完成でき、TypeScriptを標準コードとして編集できる。
- Unity C#、Unreal C++、Godot GDScript/C#を生成・編集できる。
- C++を隔離BuildしてWasmまたはNative Moduleにでき、任意Native C++をBrowserで直接実行しない。
- 全言語でInput Action/Component ID/Behavior IRを共有できる。
- Custom Script、Custom Node、複数Module、Build Profile、WorkspaceのBuild/Test/Debug/Diffが機能する。
- 非対応言語を黙って無視せず、不要Runtimeを読込まない。
- Sandbox、Capability、署名、Dependency固定を検証できる。
- 外部Engineでの独自編集をPiXiGameへ自動逆変換すると誤認させない。
