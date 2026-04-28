using FlatOut2.Telemetry.ReloadedII.Configuration;

namespace FlatOut2.Telemetry.ReloadedII.Template;

public class ModBase
{
    public virtual bool CanSuspend() => false;
    public virtual bool CanUnload() => false;
    public virtual void Suspend() { }
    public virtual void Unload() { }
    public virtual void Disposing() { }
    public virtual void Resume() { }
    public virtual void ConfigurationUpdated(Config configuration) { }
}
