# Set Working Directory
Split-Path $MyInvocation.MyCommand.Path | Push-Location
[Environment]::CurrentDirectory = $PWD

Remove-Item "$env:RELOADEDIIMODS/FlatOut2.Telemetry.ReloadedII.TemplateProbe/*" -Force -Recurse
dotnet publish "./FlatOut2.Telemetry.ReloadedII.TemplateProbe.csproj" -c Release -o "$env:RELOADEDIIMODS/FlatOut2.Telemetry.ReloadedII.TemplateProbe" /p:OutputPath="./bin/Release" /p:ReloadedILLink="true"

# Restore Working Directory
Pop-Location