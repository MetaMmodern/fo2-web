using System.ComponentModel;
using FlatOut2.Telemetry.ReloadedII.Template.Configuration;

namespace FlatOut2.Telemetry.ReloadedII.Configuration;

public class Config : Configurable<Config>
{
    [DisplayName("Enable CSV Logging")]
    [Description("When enabled, Phase 1 CSV samples are written to disk.")]
    [DefaultValue(true)]
    public bool EnableCsvLogging { get; set; } = true;

    [DisplayName("Sample Interval (ms)")]
    [Description("Polling interval for Phase 1 runtime sampling.")]
    [DefaultValue(100)]
    public int SampleIntervalMs { get; set; } = 100;
}

public class ConfiguratorMixin : ConfiguratorMixinBase
{
}
