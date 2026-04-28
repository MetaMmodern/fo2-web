using FlatOut2.Telemetry.ReloadedII.Configuration;
using FlatOut2.Telemetry.ReloadedII.Template.Configuration;
using Reloaded.Hooks.ReloadedII.Interfaces;
using Reloaded.Mod.Interfaces;
using Reloaded.Mod.Interfaces.Internal;

namespace FlatOut2.Telemetry.ReloadedII.Template;

public class Startup : IMod
{
    private ILogger _logger = null!;
    private IModLoader _modLoader = null!;
    private Config _configuration = null!;
    private IReloadedHooks? _hooks;
    private IModConfig _modConfig = null!;
    private ModBase _mod = new ModBase();

    public void StartEx(IModLoaderV1 loaderApi, IModConfigV1 modConfig)
    {
        _modLoader = (IModLoader)loaderApi;
        _modConfig = (IModConfig)modConfig;
        _logger = (ILogger)_modLoader.GetLogger();
        _modLoader.GetController<IReloadedHooks>()?.TryGetTarget(out _hooks!);

        var configurator = new Configurator(_modLoader.GetModConfigDirectory(_modConfig.ModId));
        configurator.SetContext(new() { Application = _modLoader.GetAppConfig() });

        _configuration = configurator.GetConfiguration<Config>(0);
        _configuration.ConfigurationUpdated += OnConfigurationUpdated;

        _mod = new Mod(new ModContext
        {
            Logger = _logger,
            Hooks = _hooks,
            ModLoader = _modLoader,
            ModConfig = _modConfig,
            Owner = this,
            Configuration = _configuration,
        });
    }

    private void OnConfigurationUpdated(IConfigurable configurable)
    {
        _configuration = (Config)configurable;
        _mod.ConfigurationUpdated(_configuration);
    }

    public void Suspend() => _mod.Suspend();
    public void Resume() => _mod.Resume();
    public void Unload() => _mod.Unload();
    public bool CanUnload() => _mod.CanUnload();
    public bool CanSuspend() => _mod.CanSuspend();
    public Action Disposing => () => _mod.Disposing();
}
