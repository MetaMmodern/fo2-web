using FlatOut2.Telemetry.ReloadedII.Configuration;
using Reloaded.Mod.Interfaces;

namespace FlatOut2.Telemetry.ReloadedII.Template.Configuration;

public class Configurator : IConfiguratorV3
{
    private static ConfiguratorMixin _configuratorMixin = new ConfiguratorMixin();
    private IUpdatableConfigurable[]? _configurations;

    public string? ModFolder { get; private set; }
    public string? ConfigFolder { get; private set; }
    public ConfiguratorContext Context { get; private set; }
    public IUpdatableConfigurable[] Configurations => _configurations ?? MakeConfigurations();

    public Configurator()
    {
    }

    public Configurator(string configDirectory) : this()
    {
        ConfigFolder = configDirectory;
    }

    public void Migrate(string oldDirectory, string newDirectory) => _configuratorMixin.Migrate(oldDirectory, newDirectory);
    public TType GetConfiguration<TType>(int index) => (TType)Configurations[index];
    public void SetConfigDirectory(string configDirectory) => ConfigFolder = configDirectory;
    public void SetContext(in ConfiguratorContext context) => Context = context;
    public IConfigurable[] GetConfigurations() => Configurations;
    public bool TryRunCustomConfiguration() => _configuratorMixin.TryRunCustomConfiguration(this);
    public void SetModDirectory(string modDirectory) => ModFolder = modDirectory;

    private IUpdatableConfigurable[] MakeConfigurations()
    {
        _configurations = _configuratorMixin.MakeConfigurations(ConfigFolder!);

        for (int x = 0; x < _configurations.Length; x++)
        {
            var index = x;
            _configurations[x].ConfigurationUpdated += configurable => { _configurations[index] = configurable; };
        }

        return _configurations;
    }
}
