using FlatOut2.Telemetry.ReloadedII.Configuration;
using Reloaded.Mod.Interfaces;
using IReloadedHooks = Reloaded.Hooks.ReloadedII.Interfaces.IReloadedHooks;

namespace FlatOut2.Telemetry.ReloadedII.Template;

public class ModContext
{
    public IModLoader ModLoader { get; set; } = null!;
    public IReloadedHooks? Hooks { get; set; }
    public ILogger Logger { get; set; } = null!;
    public Config Configuration { get; set; } = null!;
    public IModConfig ModConfig { get; set; } = null!;
    public IMod Owner { get; set; } = null!;
}
