using Reloaded.Mod.Interfaces;

namespace FlatOut2.Telemetry.ReloadedII.Template.Configuration;

public class ConfiguratorMixinBase
{
    public virtual IUpdatableConfigurable[] MakeConfigurations(string configFolder)
    {
        return
        [
            Configurable<global::FlatOut2.Telemetry.ReloadedII.Configuration.Config>.FromFile(Path.Combine(configFolder, "Config.json"), "Default Config")
        ];
    }

    public virtual bool TryRunCustomConfiguration(Configurator configurator)
    {
        return false;
    }

    public virtual void Migrate(string oldDirectory, string newDirectory)
    {
#pragma warning disable CS8321
        void TryMoveFile(string fileName)
        {
            try { File.Move(Path.Combine(oldDirectory, fileName), Path.Combine(newDirectory, fileName)); }
            catch (Exception) { }
        }
#pragma warning restore CS8321
    }
}
