using System.Diagnostics;

namespace FlatOut2.Telemetry.ReloadedII.Template.Configuration;

public static class Utilities
{
    public static T TryGetValue<T>(Func<T> getValue, int timeout, int sleepTime, CancellationToken token = default) where T : new()
    {
        var watch = new Stopwatch();
        watch.Start();
        var valueSet = false;
        var value = new T();

        while (watch.ElapsedMilliseconds < timeout)
        {
            if (token.IsCancellationRequested)
                return value;

            try
            {
                value = getValue();
                valueSet = true;
                break;
            }
            catch (Exception)
            {
            }

            Thread.Sleep(sleepTime);
        }

        if (!valueSet)
            throw new Exception($"Timeout limit {timeout} exceeded.");

        return value;
    }
}
