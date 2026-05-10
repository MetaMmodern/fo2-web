using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using FlatOut2.SDK.API;
using FlatOut2.SDK.Structs;
using FlatOut2.Telemetry.ReloadedII.Configuration;
using FlatOut2.Telemetry.ReloadedII.Template;
using Reloaded.Mod.Interfaces;

namespace FlatOut2.Telemetry.ReloadedII;

public sealed class Mod : ModBase
{
    private const int CameraManagerGlobalAddress = 0x008E8424;
    private const int CameraManagerEntryArrayStartOffset = 0x4;
    private const int CameraManagerEntryArrayEndOffset = 0x8;
    private const int CameraEntryCameraObjectOffset = 0x4;
    private const int CameraEntryTrackerSlotAOffset = 0x8;
    private const int CameraEntryTrackerSlotBOffset = 0xC;
    private const int CameraObjectNodeOffset = 0x20;
    private const int CameraObjectActiveProfileOffset = 0x10;
    private const int CameraObjectPlayerOffset = 0x14;
    private const int CameraObjectSourceNodeOffset = 0x18;
    private const int CameraObjectTargetNodeOffset = 0x1C;
    private const int CameraObjectDirtyFlagOffset = 0x351;
    private const int CameraObjectRuntimeSecondsOffset = 0x360;
    private const int CameraObjectActiveClipOffset = 0x370;
    private const int CameraNodeForwardOffset = 0x60;
    private const int CameraNodePositionOffset = 0x70;
    private const int CameraNodeFovOffset = 0x114;
    private const int PlayerCameraListStartOffset = 0x10;
    private const int PlayerCameraListEndOffset = 0x14;
    private const int VehicleAppliedThrottleOffset = 0x1DF4;
    private const int VehicleAppliedBrakeOffset = 0x1DF8;
    private const int VehicleControlCandidate1DfcOffset = 0x1DFC;
    private const int VehicleAppliedHandbrakeOffset = 0x1E00;
    private const int VehicleAppliedSteerOffset = 0x1E04;
    private const int VehicleCandidate1De8Offset = 0x1DE8;
    private const int VehicleCandidate1DecOffset = 0x1DEC;
    private const int VehicleCandidate1Df0Offset = 0x1DF0;
    private const int VehicleCandidate1E08Offset = 0x1E08;
    private const int VehicleCandidate1E0COffset = 0x1E0C;
    private const int VehicleCandidate1E10Offset = 0x1E10;
    private const int VehicleCandidate1E14Offset = 0x1E14;
    private const int VehicleCandidate1E18Offset = 0x1E18;
    private const int VehicleCandidate1E1COffset = 0x1E1C;
    private const int VehicleCandidate1E20Offset = 0x1E20;
    private const int VehicleCandidate1E24Offset = 0x1E24;
    private const int VehicleCandidate1E28Offset = 0x1E28;
    private const int VehicleFrameDeltaMsOffset = 0x6AD8;
    private const int VehicleFrameDeltaSecondsOffset = 0x6ADC;
    private const int VehicleGearAppliedOffset = 0x634;
    private const int VehicleGearRequestedOffset = 0x63C;
    private const int VehicleNumGearsOffset = 0x64C;
    private const int VehicleGearShiftStateOffset = 0x638;
    private const int VehicleGearShiftSyncCandidateOffset = 0x6B0;
    private const int VehicleGearShiftStateCandidateModeOffset = 0x6B4;
    private const int VehicleEngineRpmLikeOffset = 0x5D8;
    private const int VehicleDrivenSpeedScaleOffset = 0x648;
    private const int VehicleAutoShiftSpeedThresholdOffset = 0x6E4;
    private const int VehicleGearNode0PtrOffset = 0x0380;
    private const int VehicleGearNode1PtrOffset = 0x0488;
    private const int VehicleGearNode2PtrOffset = 0x0590;
    private const int VehicleWheelRateAggregateCandidateOffset = 0x03A4;
    private const int WheelRuntimeBaseOffset = 0x0A00;
    private const int WheelRuntimeStride = 0x03A0;
    private const int WheelRateDenominatorConfirmedOffset = 0x030C;
    private const int WheelRateFromDrivetrainConfirmedOffset = 0x031C;
    private const int WheelBrakeTorqueConfirmedOffset = 0x0320;
    private const int WheelRotationOrPhaseCandidateOffset = 0x032C;
    private const int WheelContactFlagOffset = 0x0334;
    private const int WheelVerticalLoadCandidateOffset = 0x0330;
    private const int WheelContactPtrOffset = 0x0348;
    private const int WheelSuspensionLengthCandidateOffset = 0x0084;
    private const int WheelTireForceMultiplierCandidateOffset = 0x0378;
    private const int WheelLoadOrSpinCandidateOffset = 0x0388;
    private const int WheelCandidate0320Offset = 0x0320;
    private const int WheelCandidate0324Offset = 0x0324;
    private const int WheelCandidate0328Offset = 0x0328;
    private const int WheelCandidate0338Offset = 0x0338;
    private const int WheelCandidate033COffset = 0x033C;
    private const int WheelCandidate0340Offset = 0x0340;
    private const int WheelCandidate0344Offset = 0x0344;
    private const int WheelCandidate036COffset = 0x036C;
    private const int WheelCandidate0370Offset = 0x0370;
    private const int WheelCandidate0374Offset = 0x0374;
    private const int WheelCandidate037COffset = 0x037C;
    private const int WheelCandidate0380Offset = 0x0380;
    private const int WheelCandidate0384Offset = 0x0384;
    private const int WheelCandidate038COffset = 0x038C;
    private const int WheelCandidate0390Offset = 0x0390;
    private const int WheelCandidate0394Offset = 0x0394;
    private const int WheelCandidate0398Offset = 0x0398;
    private const int WheelCandidate039COffset = 0x039C;
    private const int WheelCandidate03A0Offset = 0x03A0;
    private const int WheelCandidate03A4Offset = 0x03A4;
    private const int ContactSurface44Offset = 0x44;
    private const int ContactSurface48Offset = 0x48;
    private const int ContactSurface4COffset = 0x4C;
    private const int ContactSurface50Offset = 0x50;
    private const int ContactSurface54Offset = 0x54;
    private static readonly int[] WheelAngularProbeOffsets =
    {
        0x0300, 0x0304, 0x0308, 0x030C, 0x0310, 0x0314, 0x0318, 0x031C, 0x0320, 0x0324, 0x0328, 0x032C,
        0x0330, 0x0334, 0x0338, 0x033C, 0x0340, 0x0344, 0x0348, 0x034C, 0x0350, 0x0354, 0x0358, 0x035C
    };
    private const uint CarCameraTrackerVtable = 0x006743D8;
    private const uint FixedHeadCameraTrackerVtable = 0x00674098;
    private const uint StuntCameraTrackerVtable = 0x006748CC;
    private const uint GoalCameraTrackerVtable = 0x006744E4;
    private const uint CrashCameraTrackerVtable = 0x00674340;
    private const uint GoalCameraRuntimeVtable = 0x006742EC;
    private const uint GoalViewCameraRuntimeVtable = 0x0067459C;
    private const uint MemCommit = 0x1000;
    private const uint PageNoAccess = 0x01;
    private const uint PageGuard = 0x100;

    private readonly IModLoader _modLoader;
    private readonly ILogger _logger;
    private readonly IModConfig _modConfig;
    private Config _configuration;
    private readonly string _modDirectory;
    private readonly string _statusLogPath;
    private readonly CsvTelemetryWriter _csvWriter;
    private Timer? _timer;

    private long _sampleIndex;
    private int _lastRaceState = -1;
    private int _isCallbackRunning;
    private volatile bool _isDisposing;
    private volatile bool _samplingSuspended;
    private int _raceEntrySampleCountdown = 0;
    private readonly float[] _prevWheelSuspensionLength = new float[4];
    private readonly float[] _prevWheelLoadOrSpin = new float[4];
    private readonly float[] _prevWheelVerticalLoad = new float[4];
    private readonly float[] _prevWheelPhase = new float[4];
    private bool _hasPrevWheelFrame = false;
    private bool _hasPrevWheelPhaseFrame = false;

    public Mod(ModContext context)
    {
        _modLoader = context.ModLoader;
        _logger = context.Logger;
        _modConfig = context.ModConfig;
        _configuration = context.Configuration;
        _modDirectory = _modLoader.GetModConfigDirectory(_modConfig.ModId);
        Directory.CreateDirectory(_modDirectory);

        _statusLogPath = Path.Combine(_modDirectory, "phase1_status.log");
        _csvWriter = new CsvTelemetryWriter(Path.Combine(_modDirectory, "phase1_basic.csv"));

        Status("Mod constructor entered.");

        if (context.Hooks == null)
            throw new InvalidOperationException("Could not acquire Reloaded hooks controller. Make sure reloaded.sharedlib.hooks is installed and declared as a dependency.");

        Status("Reloaded hooks acquired successfully.");

        FlatOut2.SDK.SDK.Init(context.Hooks);
        Status("FlatOut2.SDK initialized.");

        StartTimer();
    }

    private void SampleTimerTick(object? _)
    {
        if (_isDisposing || _samplingSuspended)
            return;

        if (Interlocked.Exchange(ref _isCallbackRunning, 1) != 0)
            return;

        try
        {
            if (!_configuration.EnableCsvLogging)
                return;

            var isRacing = SafeGet(Info.Race.IsRacing, false);
            var raceStateInt = isRacing ? 1 : 0;
            if (raceStateInt != _lastRaceState)
            {
                _lastRaceState = raceStateInt;
                _raceEntrySampleCountdown = isRacing ? 20 : 0;
                SafeStatus(isRacing ? "Race state entered. Sampling enabled." : "Race state inactive. Sampling paused.");
            }

            if (!isRacing)
                return;

            if (_raceEntrySampleCountdown > 0)
            {
                _raceEntrySampleCountdown--;
                return;
            }

            var isPaused = SafeGet(Info.Race.IsPaused, false);
            if (isPaused)
            {
                _samplingSuspended = true;
                _timer?.Change(Timeout.Infinite, Timeout.Infinite);
                SafeStatus("Race paused. Sampling suspended for teardown safety.");
                return;
            }

            var snapshot = TryCaptureSnapshot();
            if (snapshot != null)
                _csvWriter.Write(snapshot.Value);
        }
        catch (Exception ex)
        {
            // Never let timer-thread logging faults crash the process.
            SafeStatus($"Sample failure: {ex.GetType().Name}: {ex.Message}");
        }
        finally
        {
            Interlocked.Exchange(ref _isCallbackRunning, 0);
        }
    }

    public override void ConfigurationUpdated(Config configuration)
    {
        _configuration = configuration;
        if (!_isDisposing)
        {
            _samplingSuspended = false;
            RestartTimer();
        }

        SafeStatus($"Configuration updated. sample_interval_ms={_configuration.SampleIntervalMs} enable_csv={_configuration.EnableCsvLogging}");
    }

    public override void Disposing()
    {
        _isDisposing = true;

        try { _timer?.Change(Timeout.Infinite, Timeout.Infinite); } catch { }
        try { _timer?.Dispose(); } catch { }
        try { _csvWriter.Dispose(); } catch { }
        SafeStatus("Disposed.");
    }

    private TelemetrySnapshot? TryCaptureSnapshot()
    {
        var gameState = SafeGet(() => Info.State.GetCurrentGameState().ToString(), "Unknown");
        var isRacing = SafeGet(Info.Race.IsRacing, false);
        if (!isRacing)
            return null;

        var isPaused = false;
        var raceTimeSeconds = SafeGet(() => Info.Race.GetCurrentTimer().TotalSeconds, 0.0);
        var levelId = SafeGet(Info.Race.GetCurrentLevelId, 0);
        var levelName = SafeGet(Info.Race.GetCurrentLevelName, string.Empty);
        var carId = SafeGet(() => Info.Race.GetCurrentCarId(), 0);
        var carName = SafeGet(() => Info.Race.GetCarName(carId), string.Empty);

        float playerSteer = 0.0f;
        float playerThrottle = 0.0f;
        float playerBrake = 0.0f;
        float positionX = 0.0f;
        float positionY = 0.0f;
        float positionZ = 0.0f;
        float forwardX = 0.0f;
        float forwardY = 0.0f;
        float forwardZ = 0.0f;
        float rightX = 0.0f;
        float rightY = 0.0f;
        float rightZ = 0.0f;
        float upX = 0.0f;
        float upY = 0.0f;
        float upZ = 0.0f;
        float velocityX = 0.0f;
        float velocityY = 0.0f;
        float velocityZ = 0.0f;
        float angularVelocityX = 0.0f;
        float angularVelocityY = 0.0f;
        float angularVelocityZ = 0.0f;
        float vehicleAppliedThrottle = 0.0f;
        float vehicleAppliedBrake = 0.0f;
        float vehicleControlCandidate1Dfc = 0.0f;
        float vehicleAppliedHandbrake = 0.0f;
        float vehicleAppliedSteer = 0.0f;
        int vehicleFrameDeltaMs = 0;
        float vehicleFrameDeltaSeconds = 0.0f;
        float speedMagnitude = 0.0f;
        float planarSpeedMagnitude = 0.0f;
        float origSpeedForward = 0.0f;
        float origEngineRpmCandidate = 0.0f;
        float origGearCandidate = 0.0f;
        float origClutchCandidate = 0.0f;
        int origGearAppliedConfirmed = 0;
        int origGearRequestedConfirmed = 0;
        int origGearShiftStateConfirmed = 0;
        float origGearShiftStateCandidateSyncFlag = 0.0f;
        float origGearShiftStateCandidateModeFlag = 0.0f;
        int origNumGearsConfirmed = 0;
        float origEngineRpmLikeConfirmed = 0.0f;
        float origDrivenSpeedScaleConfirmed = 0.0f;
        float origAutoShiftSpeedThresholdConfirmed = 0.0f;
        float yawRadians = 0.0f;
        float yawDegrees = 0.0f;
        float pitchRadians = 0.0f;
        float pitchDegrees = 0.0f;
        float rollRadians = 0.0f;
        float rollDegrees = 0.0f;
        float yawRate = 0.0f;
        float quaternionX = 0.0f;
        float quaternionY = 0.0f;
        float quaternionZ = 0.0f;
        float quaternionW = 0.0f;
        float cameraPositionX = 0.0f;
        float cameraPositionY = 0.0f;
        float cameraPositionZ = 0.0f;
        float cameraForwardX = 0.0f;
        float cameraForwardY = 0.0f;
        float cameraForwardZ = 0.0f;
        float cameraFov = 0.0f;
        string cameraFamily = "unknown";
        string cameraTrackerVtable = string.Empty;
        string cameraTrackerSlotAVtable = string.Empty;
        string cameraTrackerSlotBVtable = string.Empty;
        string cameraOutputActiveProfilePtr = string.Empty;
        string cameraOutputActiveProfileVtable = string.Empty;
        string cameraOutputSourceNodePtr = string.Empty;
        string cameraOutputTargetNodePtr = string.Empty;
        string cameraGoalViewActiveProfilePtr = string.Empty;
        string cameraGoalViewActiveProfileVtable = string.Empty;
        string cameraGoalViewActiveClipPtr = string.Empty;
        string cameraGoalViewActiveClipVtable = string.Empty;
        string cameraGoalViewSourceNodePtr = string.Empty;
        string cameraGoalViewTargetNodePtr = string.Empty;
        float cameraGoalViewRuntimeSeconds = 0.0f;
        int cameraGoalViewDirtyFlag = -1;
        int playerCameraListCount = 0;
        int playerCameraActiveProfileIndex = -1;
        string playerCameraList0Ptr = string.Empty;
        string playerCameraList0Vtable = string.Empty;
        string playerCameraList1Ptr = string.Empty;
        string playerCameraList1Vtable = string.Empty;
        string playerCameraList2Ptr = string.Empty;
        string playerCameraList2Vtable = string.Empty;
        string playerCameraList3Ptr = string.Empty;
        string playerCameraList3Vtable = string.Empty;
        string playerCameraList4Ptr = string.Empty;
        string playerCameraList4Vtable = string.Empty;
        string playerCameraList5Ptr = string.Empty;
        string playerCameraList5Vtable = string.Empty;
        var wheelContactFlags = new int[4];
        var wheelContactPtrs = new string[4];
        var wheelContactSurface44Candidates = new float[4];
        var wheelContactSurface48Candidates = new float[4];
        var wheelContactSurface4CCandidates = new float[4];
        var wheelContactSurface50Candidates = new float[4];
        var wheelContactSurface54Candidates = new float[4];
        var wheelSuspensionLengthCandidates = new float[4];
        var wheelTireForceMultiplierCandidates = new float[4];
        var wheelLoadOrSpinCandidates = new float[4];
        var wheelRotationOrPhaseCandidates = new float[4];
        var wheelOmegaFromPhaseRadPerSec = new float[4];
        var wheelOmegaFromPhaseRpm = new float[4];
        var wheelVerticalLoadCandidates = new float[4];
        var wheelKinematicsConfirmed = new float[16];
        var wheelAngularVelocityProbeCandidates = new float[96];
        var drivetrainRateProbeCandidates = new float[13];
        var vehicleCandidateFloats = new float[12];
        var wheelExtendedCandidates = new float[64];
        var wheelDerivedCandidates = new float[12];
        TryReadLocalPlayerInputs(ref playerSteer, ref playerThrottle, ref playerBrake);
        TryReadVehicleMotion(
            ref positionX,
            ref positionY,
            ref positionZ,
            ref forwardX,
            ref forwardY,
            ref forwardZ,
            ref rightX,
            ref rightY,
            ref rightZ,
            ref upX,
            ref upY,
            ref upZ,
            ref velocityX,
            ref velocityY,
            ref velocityZ,
            ref angularVelocityX,
            ref angularVelocityY,
            ref angularVelocityZ,
            ref vehicleAppliedThrottle,
            ref vehicleAppliedBrake,
            ref vehicleControlCandidate1Dfc,
            ref vehicleAppliedHandbrake,
            ref vehicleAppliedSteer,
            ref vehicleFrameDeltaMs,
            ref vehicleFrameDeltaSeconds,
            ref speedMagnitude,
            ref planarSpeedMagnitude,
            ref yawRadians,
            ref yawDegrees,
            ref pitchRadians,
            ref pitchDegrees,
            ref rollRadians,
            ref rollDegrees,
            ref yawRate,
            ref quaternionX,
            ref quaternionY,
            ref quaternionZ,
            ref quaternionW,
            wheelContactFlags,
            wheelContactPtrs,
            wheelContactSurface44Candidates,
            wheelContactSurface48Candidates,
            wheelContactSurface4CCandidates,
            wheelContactSurface50Candidates,
            wheelContactSurface54Candidates,
            wheelSuspensionLengthCandidates,
            wheelTireForceMultiplierCandidates,
            wheelLoadOrSpinCandidates,
            wheelRotationOrPhaseCandidates,
            wheelVerticalLoadCandidates,
            wheelKinematicsConfirmed,
            wheelAngularVelocityProbeCandidates,
            drivetrainRateProbeCandidates,
            vehicleCandidateFloats,
            wheelExtendedCandidates);
        ComputeWheelDerivedCandidates(
            vehicleFrameDeltaSeconds,
            wheelSuspensionLengthCandidates,
            wheelLoadOrSpinCandidates,
            wheelVerticalLoadCandidates,
            wheelDerivedCandidates);
        ComputeWheelPhaseOmegaCandidates(
            vehicleFrameDeltaSeconds,
            wheelRotationOrPhaseCandidates,
            wheelOmegaFromPhaseRadPerSec,
            wheelOmegaFromPhaseRpm);
        origSpeedForward =
            (velocityX * forwardX) +
            (velocityY * forwardY) +
            (velocityZ * forwardZ);
        if (vehicleCandidateFloats.Length >= 11)
        {
            // Provisional candidates retained for continuity while confirmed
            // gearbox fields below are validated against runtime behavior.
            origEngineRpmCandidate = vehicleCandidateFloats[10];
            origGearCandidate = vehicleCandidateFloats[7];
            origClutchCandidate = vehicleCandidateFloats[3];
        }
        TryReadConfirmedDrivetrainFields(
            ref origGearAppliedConfirmed,
            ref origGearRequestedConfirmed,
            ref origGearShiftStateConfirmed,
            ref origGearShiftStateCandidateSyncFlag,
            ref origGearShiftStateCandidateModeFlag,
            ref origNumGearsConfirmed,
            ref origEngineRpmLikeConfirmed,
            ref origDrivenSpeedScaleConfirmed,
            ref origAutoShiftSpeedThresholdConfirmed);
        TryReadRaceCamera(
            ref cameraPositionX,
            ref cameraPositionY,
            ref cameraPositionZ,
            ref cameraForwardX,
            ref cameraForwardY,
            ref cameraForwardZ,
            ref cameraFov,
            ref cameraFamily,
            ref cameraTrackerVtable,
            ref cameraTrackerSlotAVtable,
            ref cameraTrackerSlotBVtable,
            ref cameraOutputActiveProfilePtr,
            ref cameraOutputActiveProfileVtable,
            ref cameraOutputSourceNodePtr,
            ref cameraOutputTargetNodePtr,
            ref cameraGoalViewActiveProfilePtr,
            ref cameraGoalViewActiveProfileVtable,
            ref cameraGoalViewActiveClipPtr,
            ref cameraGoalViewActiveClipVtable,
            ref cameraGoalViewSourceNodePtr,
            ref cameraGoalViewTargetNodePtr,
            ref cameraGoalViewRuntimeSeconds,
            ref cameraGoalViewDirtyFlag,
            ref playerCameraListCount,
            ref playerCameraActiveProfileIndex,
            ref playerCameraList0Ptr,
            ref playerCameraList0Vtable,
            ref playerCameraList1Ptr,
            ref playerCameraList1Vtable,
            ref playerCameraList2Ptr,
            ref playerCameraList2Vtable,
            ref playerCameraList3Ptr,
            ref playerCameraList3Vtable,
            ref playerCameraList4Ptr,
            ref playerCameraList4Vtable,
            ref playerCameraList5Ptr,
            ref playerCameraList5Vtable);

        var sampleIndex = Interlocked.Increment(ref _sampleIndex);
        return new TelemetrySnapshot(
            TimestampUtc: DateTime.UtcNow,
            SampleIndex: sampleIndex,
            RaceTimeSeconds: raceTimeSeconds,
            GameState: gameState,
            IsRacing: isRacing,
            IsPaused: isPaused,
            LevelId: levelId,
            LevelName: levelName,
            CarId: carId,
            CarName: carName,
            PlayerSteer: playerSteer,
            PlayerThrottle: playerThrottle,
            PlayerBrake: playerBrake,
            PositionX: positionX,
            PositionY: positionY,
            PositionZ: positionZ,
            ForwardX: forwardX,
            ForwardY: forwardY,
            ForwardZ: forwardZ,
            RightX: rightX,
            RightY: rightY,
            RightZ: rightZ,
            UpX: upX,
            UpY: upY,
            UpZ: upZ,
            VelocityX: velocityX,
            VelocityY: velocityY,
            VelocityZ: velocityZ,
            AngularVelocityX: angularVelocityX,
            AngularVelocityY: angularVelocityY,
            AngularVelocityZ: angularVelocityZ,
            VehicleAppliedThrottle: vehicleAppliedThrottle,
            VehicleAppliedBrake: vehicleAppliedBrake,
            VehicleControlCandidate1Dfc: vehicleControlCandidate1Dfc,
            VehicleAppliedHandbrake: vehicleAppliedHandbrake,
            VehicleAppliedSteer: vehicleAppliedSteer,
            VehicleFrameDeltaMs: vehicleFrameDeltaMs,
            VehicleFrameDeltaSeconds: vehicleFrameDeltaSeconds,
            SpeedMagnitude: speedMagnitude,
            PlanarSpeedMagnitude: planarSpeedMagnitude,
            OrigSpeedForward: origSpeedForward,
            OrigEngineRpmCandidate: origEngineRpmCandidate,
            OrigGearCandidate: origGearCandidate,
            OrigClutchCandidate: origClutchCandidate,
            OrigGearAppliedConfirmed: origGearAppliedConfirmed,
            OrigGearRequestedConfirmed: origGearRequestedConfirmed,
            OrigGearShiftStateConfirmed: origGearShiftStateConfirmed,
            OrigGearShiftStateCandidateSyncFlag: origGearShiftStateCandidateSyncFlag,
            OrigGearShiftStateCandidateModeFlag: origGearShiftStateCandidateModeFlag,
            OrigNumGearsConfirmed: origNumGearsConfirmed,
            OrigEngineRpmLikeConfirmed: origEngineRpmLikeConfirmed,
            OrigDrivenSpeedScaleConfirmed: origDrivenSpeedScaleConfirmed,
            OrigAutoShiftSpeedThresholdConfirmed: origAutoShiftSpeedThresholdConfirmed,
            YawRadians: yawRadians,
            YawDegrees: yawDegrees,
            PitchRadians: pitchRadians,
            PitchDegrees: pitchDegrees,
            RollRadians: rollRadians,
            RollDegrees: rollDegrees,
            YawRate: yawRate,
            QuaternionX: quaternionX,
            QuaternionY: quaternionY,
            QuaternionZ: quaternionZ,
            QuaternionW: quaternionW,
            CameraPositionX: cameraPositionX,
            CameraPositionY: cameraPositionY,
            CameraPositionZ: cameraPositionZ,
            CameraForwardX: cameraForwardX,
            CameraForwardY: cameraForwardY,
            CameraForwardZ: cameraForwardZ,
            CameraFov: cameraFov,
            CameraModeIndex: playerCameraActiveProfileIndex,
            CameraFamily: cameraFamily,
            CameraTrackerVtable: cameraTrackerVtable,
            CameraTrackerSlotAVtable: cameraTrackerSlotAVtable,
            CameraTrackerSlotBVtable: cameraTrackerSlotBVtable,
            CameraOutputActiveProfilePtr: cameraOutputActiveProfilePtr,
            CameraOutputActiveProfileVtable: cameraOutputActiveProfileVtable,
            CameraOutputSourceNodePtr: cameraOutputSourceNodePtr,
            CameraOutputTargetNodePtr: cameraOutputTargetNodePtr,
            CameraGoalViewActiveProfilePtr: cameraGoalViewActiveProfilePtr,
            CameraGoalViewActiveProfileVtable: cameraGoalViewActiveProfileVtable,
            CameraGoalViewActiveClipPtr: cameraGoalViewActiveClipPtr,
            CameraGoalViewActiveClipVtable: cameraGoalViewActiveClipVtable,
            CameraGoalViewSourceNodePtr: cameraGoalViewSourceNodePtr,
            CameraGoalViewTargetNodePtr: cameraGoalViewTargetNodePtr,
            CameraGoalViewRuntimeSeconds: cameraGoalViewRuntimeSeconds,
            CameraGoalViewDirtyFlag: cameraGoalViewDirtyFlag,
            PlayerCameraListCount: playerCameraListCount,
            PlayerCameraActiveProfileIndex: playerCameraActiveProfileIndex,
            PlayerCameraList0Ptr: playerCameraList0Ptr,
            PlayerCameraList0Vtable: playerCameraList0Vtable,
            PlayerCameraList1Ptr: playerCameraList1Ptr,
            PlayerCameraList1Vtable: playerCameraList1Vtable,
            PlayerCameraList2Ptr: playerCameraList2Ptr,
            PlayerCameraList2Vtable: playerCameraList2Vtable,
            PlayerCameraList3Ptr: playerCameraList3Ptr,
            PlayerCameraList3Vtable: playerCameraList3Vtable,
            PlayerCameraList4Ptr: playerCameraList4Ptr,
            PlayerCameraList4Vtable: playerCameraList4Vtable,
            PlayerCameraList5Ptr: playerCameraList5Ptr,
            PlayerCameraList5Vtable: playerCameraList5Vtable,
            WheelContactFlags: wheelContactFlags,
            WheelContactPtrs: wheelContactPtrs,
            WheelContactSurface44Candidates: wheelContactSurface44Candidates,
            WheelContactSurface48Candidates: wheelContactSurface48Candidates,
            WheelContactSurface4CCandidates: wheelContactSurface4CCandidates,
            WheelContactSurface50Candidates: wheelContactSurface50Candidates,
            WheelContactSurface54Candidates: wheelContactSurface54Candidates,
            WheelSuspensionLengthCandidates: wheelSuspensionLengthCandidates,
            WheelTireForceMultiplierCandidates: wheelTireForceMultiplierCandidates,
            WheelLoadOrSpinCandidates: wheelLoadOrSpinCandidates,
            WheelRotationOrPhaseCandidates: wheelRotationOrPhaseCandidates,
            WheelOmegaFromPhaseRadPerSec: wheelOmegaFromPhaseRadPerSec,
            WheelOmegaFromPhaseRpm: wheelOmegaFromPhaseRpm,
            WheelVerticalLoadCandidates: wheelVerticalLoadCandidates,
            WheelKinematicsConfirmed: wheelKinematicsConfirmed,
            WheelAngularVelocityProbeCandidates: wheelAngularVelocityProbeCandidates,
            DrivetrainRateProbeCandidates: drivetrainRateProbeCandidates,
            VehicleCandidateFloats: vehicleCandidateFloats,
            WheelExtendedCandidates: wheelExtendedCandidates,
            WheelDerivedCandidates: wheelDerivedCandidates);
    }

    private unsafe void TryReadConfirmedDrivetrainFields(
        ref int gearApplied,
        ref int gearRequested,
        ref int gearShiftState,
        ref float gearShiftSyncFlagCandidate,
        ref float gearShiftModeFlagCandidate,
        ref int numGears,
        ref float engineRpmLike,
        ref float drivenSpeedScale,
        ref float autoShiftSpeedThreshold)
    {
        try
        {
            var raceInfoPtr = RaceInfo.Instance;
            if (raceInfoPtr == null)
                return;

            var raceInfo = *raceInfoPtr;
            if (raceInfo == null || raceInfo->HostObject == null || raceInfo->HostObject->LocalPlayer == null)
                return;

            var localPlayer = *raceInfo->HostObject->LocalPlayer;
            if (localPlayer == null || localPlayer->Car == null)
                return;

            var vehicle = (Car*)localPlayer->Car;
            var vehicleBase = (byte*)vehicle;
            gearApplied = *(int*)(vehicleBase + VehicleGearAppliedOffset);
            gearRequested = *(int*)(vehicleBase + VehicleGearRequestedOffset);
            gearShiftState = *(int*)(vehicleBase + VehicleGearShiftStateOffset);
            gearShiftSyncFlagCandidate = *(float*)(vehicleBase + VehicleGearShiftSyncCandidateOffset);
            gearShiftModeFlagCandidate = *(float*)(vehicleBase + VehicleGearShiftStateCandidateModeOffset);
            numGears = *(int*)(vehicleBase + VehicleNumGearsOffset);
            engineRpmLike = *(float*)(vehicleBase + VehicleEngineRpmLikeOffset);
            drivenSpeedScale = *(float*)(vehicleBase + VehicleDrivenSpeedScaleOffset);
            autoShiftSpeedThreshold = *(float*)(vehicleBase + VehicleAutoShiftSpeedThresholdOffset);
        }
        catch (Exception ex)
        {
            SafeStatus($"Drivetrain read failure: {ex.GetType().Name}: {ex.Message}");
        }
    }

    private unsafe void TryReadLocalPlayerInputs(ref float steer, ref float throttle, ref float brake)
    {
        try
        {
            var raceInfoPtr = RaceInfo.Instance;
            if (raceInfoPtr == null)
                return;

            var raceInfo = *raceInfoPtr;
            if (raceInfo == null)
                return;

            var hostObject = raceInfo->HostObject;
            if (hostObject == null)
                return;

            var localPlayerPtr = hostObject->LocalPlayer;
            if (localPlayerPtr == null)
                return;

            var localPlayer = *localPlayerPtr;
            if (localPlayer == null)
                return;

            steer = localPlayer->SteerAngle;
            throttle = localPlayer->GasPedal;
            brake = localPlayer->BrakePedal;
        }
        catch (Exception ex)
        {
            SafeStatus($"Input read failure: {ex.GetType().Name}: {ex.Message}");
        }
    }

    private unsafe void TryReadVehicleMotion(
        ref float positionX,
        ref float positionY,
        ref float positionZ,
        ref float forwardX,
        ref float forwardY,
        ref float forwardZ,
        ref float rightX,
        ref float rightY,
        ref float rightZ,
        ref float upX,
        ref float upY,
        ref float upZ,
        ref float velocityX,
        ref float velocityY,
        ref float velocityZ,
        ref float angularVelocityX,
        ref float angularVelocityY,
        ref float angularVelocityZ,
        ref float vehicleAppliedThrottle,
        ref float vehicleAppliedBrake,
        ref float vehicleControlCandidate1Dfc,
        ref float vehicleAppliedHandbrake,
        ref float vehicleAppliedSteer,
        ref int vehicleFrameDeltaMs,
        ref float vehicleFrameDeltaSeconds,
        ref float speedMagnitude,
        ref float planarSpeedMagnitude,
        ref float yawRadians,
        ref float yawDegrees,
        ref float pitchRadians,
        ref float pitchDegrees,
        ref float rollRadians,
        ref float rollDegrees,
        ref float yawRate,
        ref float quaternionX,
        ref float quaternionY,
        ref float quaternionZ,
        ref float quaternionW,
        int[] wheelContactFlags,
        string[] wheelContactPtrs,
        float[] wheelContactSurface44Candidates,
        float[] wheelContactSurface48Candidates,
        float[] wheelContactSurface4CCandidates,
        float[] wheelContactSurface50Candidates,
        float[] wheelContactSurface54Candidates,
        float[] wheelSuspensionLengthCandidates,
        float[] wheelTireForceMultiplierCandidates,
        float[] wheelLoadOrSpinCandidates,
        float[] wheelRotationOrPhaseCandidates,
        float[] wheelVerticalLoadCandidates,
        float[] wheelKinematicsConfirmed,
        float[] wheelAngularVelocityProbeCandidates,
        float[] drivetrainRateProbeCandidates,
        float[] vehicleCandidateFloats,
        float[] wheelExtendedCandidates)
    {
        try
        {
            var raceInfoPtr = RaceInfo.Instance;
            if (raceInfoPtr == null)
                return;

            var raceInfo = *raceInfoPtr;
            if (raceInfo == null || raceInfo->HostObject == null || raceInfo->HostObject->LocalPlayer == null)
                return;

            var localPlayer = *raceInfo->HostObject->LocalPlayer;
            if (localPlayer == null || localPlayer->Car == null)
                return;

            var vehicle = (Car*)localPlayer->Car;
            positionX = vehicle->Position.X;
            positionY = vehicle->Position.Y;
            positionZ = vehicle->Position.Z;

            forwardX = vehicle->Matrix.At.X;
            forwardY = vehicle->Matrix.At.Y;
            forwardZ = vehicle->Matrix.At.Z;

            rightX = vehicle->Matrix.Right.X;
            rightY = vehicle->Matrix.Right.Y;
            rightZ = vehicle->Matrix.Right.Z;

            upX = vehicle->Matrix.Up.X;
            upY = vehicle->Matrix.Up.Y;
            upZ = vehicle->Matrix.Up.Z;

            velocityX = vehicle->Velocity.X;
            velocityY = vehicle->Velocity.Y;
            velocityZ = vehicle->Velocity.Z;

            angularVelocityX = vehicle->RotationVelocity.X;
            angularVelocityY = vehicle->RotationVelocity.Y;
            angularVelocityZ = vehicle->RotationVelocity.Z;

            var vehicleBase = (byte*)vehicle;
            vehicleAppliedThrottle = *(float*)(vehicleBase + VehicleAppliedThrottleOffset);
            vehicleAppliedBrake = *(float*)(vehicleBase + VehicleAppliedBrakeOffset);
            vehicleControlCandidate1Dfc = *(float*)(vehicleBase + VehicleControlCandidate1DfcOffset);
            vehicleAppliedHandbrake = *(float*)(vehicleBase + VehicleAppliedHandbrakeOffset);
            vehicleAppliedSteer = *(float*)(vehicleBase + VehicleAppliedSteerOffset);
            vehicleFrameDeltaMs = *(int*)(vehicleBase + VehicleFrameDeltaMsOffset);
            vehicleFrameDeltaSeconds = *(float*)(vehicleBase + VehicleFrameDeltaSecondsOffset);
            vehicleCandidateFloats[0] = *(float*)(vehicleBase + VehicleCandidate1De8Offset);
            vehicleCandidateFloats[1] = *(float*)(vehicleBase + VehicleCandidate1DecOffset);
            vehicleCandidateFloats[2] = *(float*)(vehicleBase + VehicleCandidate1Df0Offset);
            vehicleCandidateFloats[3] = *(float*)(vehicleBase + VehicleCandidate1E08Offset);
            vehicleCandidateFloats[4] = *(float*)(vehicleBase + VehicleCandidate1E0COffset);
            vehicleCandidateFloats[5] = *(float*)(vehicleBase + VehicleCandidate1E10Offset);
            vehicleCandidateFloats[6] = *(float*)(vehicleBase + VehicleCandidate1E14Offset);
            vehicleCandidateFloats[7] = *(float*)(vehicleBase + VehicleCandidate1E18Offset);
            vehicleCandidateFloats[8] = *(float*)(vehicleBase + VehicleCandidate1E1COffset);
            vehicleCandidateFloats[9] = *(float*)(vehicleBase + VehicleCandidate1E20Offset);
            vehicleCandidateFloats[10] = *(float*)(vehicleBase + VehicleCandidate1E24Offset);
            vehicleCandidateFloats[11] = *(float*)(vehicleBase + VehicleCandidate1E28Offset);

            speedMagnitude = MathF.Sqrt(
                (velocityX * velocityX) +
                (velocityY * velocityY) +
                (velocityZ * velocityZ));

            planarSpeedMagnitude = MathF.Sqrt(
                (velocityX * velocityX) +
                (velocityZ * velocityZ));

            yawRadians = MathF.Atan2(forwardX, forwardZ);
            yawDegrees = yawRadians * (180.0f / MathF.PI);
            pitchRadians = MathF.Atan2(-forwardY, MathF.Sqrt((forwardX * forwardX) + (forwardZ * forwardZ)));
            pitchDegrees = pitchRadians * (180.0f / MathF.PI);
            rollRadians = MathF.Atan2(rightY, upY);
            rollDegrees = rollRadians * (180.0f / MathF.PI);
            yawRate = angularVelocityY;

            quaternionX = vehicle->Quaternion.X;
            quaternionY = vehicle->Quaternion.Y;
            quaternionZ = vehicle->Quaternion.Z;
            quaternionW = vehicle->Quaternion.W;

            TryReadWheelCandidates(
                (byte*)vehicle,
                wheelContactFlags,
                wheelContactPtrs,
                wheelContactSurface44Candidates,
                wheelContactSurface48Candidates,
                wheelContactSurface4CCandidates,
                wheelContactSurface50Candidates,
                wheelContactSurface54Candidates,
                wheelSuspensionLengthCandidates,
                wheelTireForceMultiplierCandidates,
                wheelLoadOrSpinCandidates,
                wheelRotationOrPhaseCandidates,
            wheelVerticalLoadCandidates,
            wheelKinematicsConfirmed,
            wheelAngularVelocityProbeCandidates,
            wheelExtendedCandidates);

            TryReadDrivetrainRateProbes((byte*)vehicle, drivetrainRateProbeCandidates);
        }
        catch (Exception ex)
        {
            SafeStatus($"Vehicle motion read failure: {ex.GetType().Name}: {ex.Message}");
        }
    }

    private unsafe void TryReadRaceCamera(
        ref float cameraPositionX,
        ref float cameraPositionY,
        ref float cameraPositionZ,
        ref float cameraForwardX,
        ref float cameraForwardY,
        ref float cameraForwardZ,
        ref float cameraFov,
        ref string cameraFamily,
        ref string cameraTrackerVtable,
        ref string cameraTrackerSlotAVtable,
        ref string cameraTrackerSlotBVtable,
        ref string cameraOutputActiveProfilePtr,
        ref string cameraOutputActiveProfileVtable,
        ref string cameraOutputSourceNodePtr,
        ref string cameraOutputTargetNodePtr,
        ref string cameraGoalViewActiveProfilePtr,
        ref string cameraGoalViewActiveProfileVtable,
        ref string cameraGoalViewActiveClipPtr,
        ref string cameraGoalViewActiveClipVtable,
        ref string cameraGoalViewSourceNodePtr,
        ref string cameraGoalViewTargetNodePtr,
        ref float cameraGoalViewRuntimeSeconds,
        ref int cameraGoalViewDirtyFlag,
        ref int playerCameraListCount,
        ref int playerCameraActiveProfileIndex,
        ref string playerCameraList0Ptr,
        ref string playerCameraList0Vtable,
        ref string playerCameraList1Ptr,
        ref string playerCameraList1Vtable,
        ref string playerCameraList2Ptr,
        ref string playerCameraList2Vtable,
        ref string playerCameraList3Ptr,
        ref string playerCameraList3Vtable,
        ref string playerCameraList4Ptr,
        ref string playerCameraList4Vtable,
        ref string playerCameraList5Ptr,
        ref string playerCameraList5Vtable)
    {
        try
        {
            if (!IsReadable((byte*)CameraManagerGlobalAddress, sizeof(uint)))
                return;

            var cameraManager = *(byte**)CameraManagerGlobalAddress;
            if (!IsReadable(cameraManager, CameraManagerEntryArrayEndOffset + sizeof(uint)))
                return;

            var entryStart = *(byte***)(cameraManager + CameraManagerEntryArrayStartOffset);
            var entryEnd = *(byte***)(cameraManager + CameraManagerEntryArrayEndOffset);
            if (entryStart == null || entryEnd == null || entryStart >= entryEnd || !IsReadable((byte*)entryStart, sizeof(uint)))
                return;

            var firstViewEntry = *entryStart;
            if (!IsReadable(firstViewEntry, CameraEntryTrackerSlotBOffset + sizeof(uint)))
                return;

            var trackerSlotA = *(byte**)(firstViewEntry + CameraEntryTrackerSlotAOffset);
            var trackerSlotB = *(byte**)(firstViewEntry + CameraEntryTrackerSlotBOffset);
            var cameraObject = *(byte**)(firstViewEntry + CameraEntryCameraObjectOffset);
            if (!IsReadable(cameraObject, CameraObjectActiveClipOffset + sizeof(uint)))
                return;

            var trackerVtable = *(uint*)cameraObject;
            cameraTrackerVtable = $"0x{trackerVtable:X8}";
            cameraFamily = GetCameraFamilyName(trackerVtable);

            cameraTrackerSlotAVtable = ReadVtableString(trackerSlotA);
            cameraTrackerSlotBVtable = ReadVtableString(trackerSlotB);

            var activeProfile = *(byte**)(cameraObject + CameraObjectActiveProfileOffset);
            var sourceNode = *(byte**)(cameraObject + CameraObjectSourceNodeOffset);
            var targetNode = *(byte**)(cameraObject + CameraObjectTargetNodeOffset);

            cameraOutputActiveProfilePtr = FormatPointer(activeProfile);
            cameraOutputActiveProfileVtable = ReadVtableString(activeProfile);
            cameraOutputSourceNodePtr = FormatPointer(sourceNode);
            cameraOutputTargetNodePtr = FormatPointer(targetNode);

            TryReadGoalViewRuntime(
                trackerSlotB,
                ref cameraGoalViewActiveProfilePtr,
                ref cameraGoalViewActiveProfileVtable,
                ref cameraGoalViewActiveClipPtr,
                ref cameraGoalViewActiveClipVtable,
                ref cameraGoalViewSourceNodePtr,
                ref cameraGoalViewTargetNodePtr,
                ref cameraGoalViewRuntimeSeconds,
                ref cameraGoalViewDirtyFlag);

            var cameraNode = cameraObject + CameraObjectNodeOffset;
            if (!IsReadable(cameraNode, CameraNodeFovOffset + sizeof(float)))
                return;

            var cameraForward = (Vector3Pad*)(cameraNode + CameraNodeForwardOffset);
            var cameraPosition = (Vector3Pad*)(cameraNode + CameraNodePositionOffset);

            cameraForwardX = cameraForward->X;
            cameraForwardY = cameraForward->Y;
            cameraForwardZ = cameraForward->Z;

            cameraPositionX = cameraPosition->X;
            cameraPositionY = cameraPosition->Y;
            cameraPositionZ = cameraPosition->Z;

            cameraFov = *(float*)(cameraNode + CameraNodeFovOffset);

            TryReadPlayerCameraList(
                activeProfile,
                ref playerCameraListCount,
                ref playerCameraActiveProfileIndex,
                ref playerCameraList0Ptr,
                ref playerCameraList0Vtable,
                ref playerCameraList1Ptr,
                ref playerCameraList1Vtable,
                ref playerCameraList2Ptr,
                ref playerCameraList2Vtable,
                ref playerCameraList3Ptr,
                ref playerCameraList3Vtable,
                ref playerCameraList4Ptr,
                ref playerCameraList4Vtable,
                ref playerCameraList5Ptr,
                ref playerCameraList5Vtable);
        }
        catch (Exception ex)
        {
            SafeStatus($"Camera read failure: {ex.GetType().Name}: {ex.Message}");
        }
    }

    private unsafe void TryReadGoalViewRuntime(
        byte* goalViewObject,
        ref string activeProfilePtr,
        ref string activeProfileVtable,
        ref string activeClipPtr,
        ref string activeClipVtable,
        ref string sourceNodePtr,
        ref string targetNodePtr,
        ref float runtimeSeconds,
        ref int dirtyFlag)
    {
        if (!IsReadable(goalViewObject, CameraObjectActiveClipOffset + sizeof(uint)))
            return;

        var activeProfile = *(byte**)(goalViewObject + CameraObjectActiveProfileOffset);
        var activeClip = *(byte**)(goalViewObject + CameraObjectActiveClipOffset);
        var sourceNode = *(byte**)(goalViewObject + CameraObjectSourceNodeOffset);
        var targetNode = *(byte**)(goalViewObject + CameraObjectTargetNodeOffset);

        activeProfilePtr = FormatPointer(activeProfile);
        activeProfileVtable = ReadVtableString(activeProfile);
        activeClipPtr = FormatPointer(activeClip);
        activeClipVtable = ReadVtableString(activeClip);
        sourceNodePtr = FormatPointer(sourceNode);
        targetNodePtr = FormatPointer(targetNode);
        runtimeSeconds = *(float*)(goalViewObject + CameraObjectRuntimeSecondsOffset);
        dirtyFlag = *(byte*)(goalViewObject + CameraObjectDirtyFlagOffset);
    }

    private unsafe void TryReadPlayerCameraList(
        byte* activeProfile,
        ref int playerCameraListCount,
        ref int playerCameraActiveProfileIndex,
        ref string playerCameraList0Ptr,
        ref string playerCameraList0Vtable,
        ref string playerCameraList1Ptr,
        ref string playerCameraList1Vtable,
        ref string playerCameraList2Ptr,
        ref string playerCameraList2Vtable,
        ref string playerCameraList3Ptr,
        ref string playerCameraList3Vtable,
        ref string playerCameraList4Ptr,
        ref string playerCameraList4Vtable,
        ref string playerCameraList5Ptr,
        ref string playerCameraList5Vtable)
    {
        var localPlayer = TryGetLocalPlayerRaw();
        if (!IsReadable(localPlayer, PlayerCameraListEndOffset + sizeof(uint)))
            return;

        var listStart = *(byte***)(localPlayer + PlayerCameraListStartOffset);
        var listEnd = *(byte***)(localPlayer + PlayerCameraListEndOffset);
        if (listStart == null || listEnd == null || listStart > listEnd)
            return;

        var count = (int)(listEnd - listStart);
        if (count < 0 || count > 64)
            return;

        if (count > 0 && !IsReadable((byte*)listStart, count * sizeof(uint)))
            return;

        playerCameraListCount = count;
        for (var i = 0; i < count; i++)
        {
            var candidate = listStart[i];
            if (candidate == activeProfile)
                playerCameraActiveProfileIndex = i;

            if (i >= 6)
                continue;

            var pointer = FormatPointer(candidate);
            var vtable = ReadVtableString(candidate);
            switch (i)
            {
                case 0:
                    playerCameraList0Ptr = pointer;
                    playerCameraList0Vtable = vtable;
                    break;
                case 1:
                    playerCameraList1Ptr = pointer;
                    playerCameraList1Vtable = vtable;
                    break;
                case 2:
                    playerCameraList2Ptr = pointer;
                    playerCameraList2Vtable = vtable;
                    break;
                case 3:
                    playerCameraList3Ptr = pointer;
                    playerCameraList3Vtable = vtable;
                    break;
                case 4:
                    playerCameraList4Ptr = pointer;
                    playerCameraList4Vtable = vtable;
                    break;
                case 5:
                    playerCameraList5Ptr = pointer;
                    playerCameraList5Vtable = vtable;
                    break;
            }
        }
    }

    private unsafe byte* TryGetLocalPlayerRaw()
    {
        var raceInfoPtr = RaceInfo.Instance;
        if (raceInfoPtr == null)
            return null;

        var raceInfo = *raceInfoPtr;
        if (raceInfo == null || raceInfo->HostObject == null || raceInfo->HostObject->LocalPlayer == null)
            return null;

        return (byte*)*raceInfo->HostObject->LocalPlayer;
    }

    private unsafe void TryReadWheelCandidates(
        byte* vehicle,
        int[] contactFlags,
        string[] contactPtrs,
        float[] contactSurface44Candidates,
        float[] contactSurface48Candidates,
        float[] contactSurface4CCandidates,
        float[] contactSurface50Candidates,
        float[] contactSurface54Candidates,
        float[] suspensionLengthCandidates,
        float[] tireForceMultiplierCandidates,
        float[] loadOrSpinCandidates,
        float[] rotationOrPhaseCandidates,
        float[] verticalLoadCandidates,
        float[] wheelKinematicsConfirmed,
        float[] wheelAngularVelocityProbeCandidates,
        float[] wheelExtendedCandidates)
    {
        if (vehicle == null)
            return;

        for (var i = 0; i < 4; i++)
        {
            var wheel = vehicle + WheelRuntimeBaseOffset + (i * WheelRuntimeStride);
            if (!IsReadable(wheel, WheelCandidate03A4Offset + sizeof(float)))
                continue;

            contactFlags[i] = *(int*)(wheel + WheelContactFlagOffset);
            var contactPtr = *(byte**)(wheel + WheelContactPtrOffset);
            contactPtrs[i] = FormatPointer(contactPtr);
            suspensionLengthCandidates[i] = *(float*)(wheel + WheelSuspensionLengthCandidateOffset);
            tireForceMultiplierCandidates[i] = *(float*)(wheel + WheelTireForceMultiplierCandidateOffset);
            loadOrSpinCandidates[i] = *(float*)(wheel + WheelLoadOrSpinCandidateOffset);
            rotationOrPhaseCandidates[i] = *(float*)(wheel + WheelRotationOrPhaseCandidateOffset);
            verticalLoadCandidates[i] = *(float*)(wheel + WheelVerticalLoadCandidateOffset);
            var kinematicsBaseIndex = i * 4;
            wheelKinematicsConfirmed[kinematicsBaseIndex + 0] = *(float*)(wheel + WheelRateDenominatorConfirmedOffset);
            wheelKinematicsConfirmed[kinematicsBaseIndex + 1] = *(float*)(wheel + WheelRateFromDrivetrainConfirmedOffset);
            wheelKinematicsConfirmed[kinematicsBaseIndex + 2] = *(float*)(wheel + WheelBrakeTorqueConfirmedOffset);
            wheelKinematicsConfirmed[kinematicsBaseIndex + 3] = *(float*)(wheel + WheelRotationOrPhaseCandidateOffset);
            var probeBaseIndex = i * WheelAngularProbeOffsets.Length;
            for (var probe = 0; probe < WheelAngularProbeOffsets.Length; probe++)
            {
                wheelAngularVelocityProbeCandidates[probeBaseIndex + probe] = *(float*)(wheel + WheelAngularProbeOffsets[probe]);
            }
            var baseIndex = i * 16;
            wheelExtendedCandidates[baseIndex + 0] = *(float*)(wheel + WheelCandidate0320Offset);
            wheelExtendedCandidates[baseIndex + 1] = *(float*)(wheel + WheelCandidate0324Offset);
            wheelExtendedCandidates[baseIndex + 2] = *(float*)(wheel + WheelCandidate0328Offset);
            wheelExtendedCandidates[baseIndex + 3] = *(float*)(wheel + WheelCandidate0338Offset);
            wheelExtendedCandidates[baseIndex + 4] = *(float*)(wheel + WheelCandidate0344Offset);
            wheelExtendedCandidates[baseIndex + 5] = *(float*)(wheel + WheelCandidate036COffset);
            wheelExtendedCandidates[baseIndex + 6] = *(float*)(wheel + WheelCandidate0370Offset);
            wheelExtendedCandidates[baseIndex + 7] = *(float*)(wheel + WheelCandidate0374Offset);
            wheelExtendedCandidates[baseIndex + 8] = *(float*)(wheel + WheelCandidate037COffset);
            wheelExtendedCandidates[baseIndex + 9] = *(float*)(wheel + WheelCandidate0380Offset);
            wheelExtendedCandidates[baseIndex + 10] = *(float*)(wheel + WheelCandidate0384Offset);
            wheelExtendedCandidates[baseIndex + 11] = *(float*)(wheel + WheelCandidate038COffset);
            wheelExtendedCandidates[baseIndex + 12] = *(float*)(wheel + WheelCandidate0390Offset);
            wheelExtendedCandidates[baseIndex + 13] = *(float*)(wheel + WheelCandidate0394Offset);
            wheelExtendedCandidates[baseIndex + 14] = *(float*)(wheel + WheelCandidate0398Offset);
            wheelExtendedCandidates[baseIndex + 15] = *(float*)(wheel + WheelCandidate039COffset);

            if (!IsReadable(contactPtr, ContactSurface54Offset + sizeof(float)))
                continue;

            contactSurface44Candidates[i] = *(float*)(contactPtr + ContactSurface44Offset);
            contactSurface48Candidates[i] = *(float*)(contactPtr + ContactSurface48Offset);
            contactSurface4CCandidates[i] = *(float*)(contactPtr + ContactSurface4COffset);
            contactSurface50Candidates[i] = *(float*)(contactPtr + ContactSurface50Offset);
            contactSurface54Candidates[i] = *(float*)(contactPtr + ContactSurface54Offset);
        }
    }

    private unsafe void TryReadDrivetrainRateProbes(byte* vehicle, float[] drivetrainRateProbeCandidates)
    {
        if (vehicle == null || drivetrainRateProbeCandidates == null || drivetrainRateProbeCandidates.Length < 13)
            return;

        var node0 = *(byte**)(vehicle + VehicleGearNode0PtrOffset);
        var node1 = *(byte**)(vehicle + VehicleGearNode1PtrOffset);
        var node2 = *(byte**)(vehicle + VehicleGearNode2PtrOffset);

        drivetrainRateProbeCandidates[0] = node0 != null ? (uint)node0 : 0.0f;
        drivetrainRateProbeCandidates[1] = node1 != null ? (uint)node1 : 0.0f;
        drivetrainRateProbeCandidates[2] = node2 != null ? (uint)node2 : 0.0f;
        drivetrainRateProbeCandidates[3] = *(float*)(vehicle + VehicleWheelRateAggregateCandidateOffset);

        drivetrainRateProbeCandidates[4] = ReadNodeFloat(node0, 0x2C);
        drivetrainRateProbeCandidates[5] = ReadNodeFloat(node1, 0x2C);
        drivetrainRateProbeCandidates[6] = ReadNodeFloat(node2, 0x2C);
        drivetrainRateProbeCandidates[7] = ReadNodeFloat(node0, 0x38);
        drivetrainRateProbeCandidates[8] = ReadNodeFloat(node1, 0x38);
        drivetrainRateProbeCandidates[9] = ReadNodeFloat(node2, 0x38);
        drivetrainRateProbeCandidates[10] = ReadNodeFloat(node0, 0x3C);
        drivetrainRateProbeCandidates[11] = ReadNodeFloat(node1, 0x3C);
        drivetrainRateProbeCandidates[12] = ReadNodeFloat(node2, 0x3C);
    }

    private static unsafe float ReadNodeFloat(byte* node, int offset)
    {
        if (!IsReadable(node, offset + sizeof(float)))
            return 0.0f;

        return *(float*)(node + offset);
    }

    private void ComputeWheelDerivedCandidates(
        float vehicleFrameDeltaSeconds,
        float[] suspensionLengthCandidates,
        float[] loadOrSpinCandidates,
        float[] verticalLoadCandidates,
        float[] wheelDerivedCandidates)
    {
        if (wheelDerivedCandidates == null || wheelDerivedCandidates.Length < 12)
            return;

        var dt = vehicleFrameDeltaSeconds > 1e-5f ? vehicleFrameDeltaSeconds : 0.01f;
        for (var i = 0; i < 4; i++)
        {
            var baseIndex = i * 3;
            if (_hasPrevWheelFrame)
            {
                wheelDerivedCandidates[baseIndex + 0] = (suspensionLengthCandidates[i] - _prevWheelSuspensionLength[i]) / dt;
                wheelDerivedCandidates[baseIndex + 1] = (loadOrSpinCandidates[i] - _prevWheelLoadOrSpin[i]) / dt;
                wheelDerivedCandidates[baseIndex + 2] = (verticalLoadCandidates[i] - _prevWheelVerticalLoad[i]) / dt;
            }
            else
            {
                wheelDerivedCandidates[baseIndex + 0] = 0.0f;
                wheelDerivedCandidates[baseIndex + 1] = 0.0f;
                wheelDerivedCandidates[baseIndex + 2] = 0.0f;
            }

            _prevWheelSuspensionLength[i] = suspensionLengthCandidates[i];
            _prevWheelLoadOrSpin[i] = loadOrSpinCandidates[i];
            _prevWheelVerticalLoad[i] = verticalLoadCandidates[i];
        }

        _hasPrevWheelFrame = true;
    }

    private void ComputeWheelPhaseOmegaCandidates(
        float vehicleFrameDeltaSeconds,
        float[] wheelRotationOrPhaseCandidates,
        float[] wheelOmegaFromPhaseRadPerSec,
        float[] wheelOmegaFromPhaseRpm)
    {
        if (wheelRotationOrPhaseCandidates == null ||
            wheelOmegaFromPhaseRadPerSec == null ||
            wheelOmegaFromPhaseRpm == null ||
            wheelRotationOrPhaseCandidates.Length < 4 ||
            wheelOmegaFromPhaseRadPerSec.Length < 4 ||
            wheelOmegaFromPhaseRpm.Length < 4)
            return;

        var dt = vehicleFrameDeltaSeconds > 1e-5f ? vehicleFrameDeltaSeconds : 0.01f;
        const float twoPi = 2.0f * MathF.PI;
        const float radPerSecToRpm = 60.0f / (2.0f * MathF.PI);

        for (var i = 0; i < 4; i++)
        {
            var phase = wheelRotationOrPhaseCandidates[i];
            var omega = 0.0f;

            if (_hasPrevWheelPhaseFrame)
            {
                var delta = phase - _prevWheelPhase[i];
                if (delta > MathF.PI)
                    delta -= twoPi;
                else if (delta < -MathF.PI)
                    delta += twoPi;

                omega = delta / dt;
            }

            wheelOmegaFromPhaseRadPerSec[i] = omega;
            wheelOmegaFromPhaseRpm[i] = omega * radPerSecToRpm;
            _prevWheelPhase[i] = phase;
        }

        _hasPrevWheelPhaseFrame = true;
    }

    private static unsafe string ReadVtableString(byte* instance)
    {
        if (!IsReadable(instance, sizeof(uint)))
            return string.Empty;

        return $"0x{*(uint*)instance:X8}";
    }

    private static unsafe string FormatPointer(byte* pointer)
    {
        if (pointer == null)
            return string.Empty;

        return $"0x{(uint)pointer:X8}";
    }

    private static unsafe bool IsReadable(byte* address, int bytes)
    {
        if (address == null || bytes <= 0)
            return false;

        if (VirtualQuery((nint)address, out var info, (nuint)Marshal.SizeOf<MemoryBasicInformation>()) == 0)
            return false;

        if (info.State != MemCommit)
            return false;

        if ((info.Protect & (PageNoAccess | PageGuard)) != 0)
            return false;

        var start = (nuint)address;
        var regionStart = (nuint)info.BaseAddress;
        var regionEnd = regionStart + info.RegionSize;
        return start >= regionStart && start + (nuint)bytes <= regionEnd;
    }

    [DllImport("kernel32.dll")]
    private static extern nuint VirtualQuery(nint lpAddress, out MemoryBasicInformation lpBuffer, nuint dwLength);

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryBasicInformation
    {
        public nint BaseAddress;
        public nint AllocationBase;
        public uint AllocationProtect;
        public nuint RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
    }

    private static string GetCameraFamilyName(uint trackerVtable) =>
        trackerVtable switch
        {
            CarCameraTrackerVtable => "car",
            FixedHeadCameraTrackerVtable => "fixed_head",
            StuntCameraTrackerVtable => "stunt",
            GoalCameraTrackerVtable => "goal",
            CrashCameraTrackerVtable => "crash",
            GoalCameraRuntimeVtable => "goal_runtime",
            GoalViewCameraRuntimeVtable => "goal_view_runtime",
            _ => "unknown"
        };

    private void Status(string message)
    {
        var line = $"{DateTime.UtcNow:O} {message}{Environment.NewLine}";
        File.AppendAllText(_statusLogPath, line);
        _logger.WriteLine($"[{_modConfig.ModId}] {message}");
    }

    private void SafeStatus(string message)
    {
        try
        {
            Status(message);
        }
        catch
        {
        }
    }

    private static T SafeGet<T>(Func<T> getter, T fallback)
    {
        try
        {
            return getter();
        }
        catch
        {
            return fallback;
        }
    }

    private void StartTimer()
    {
        var interval = Math.Max(10, _configuration.SampleIntervalMs);
        _timer = new Timer(SampleTimerTick, null, dueTime: 5000, period: interval);
        SafeStatus($"Sampling timer started. interval_ms={interval} due_time_ms=5000");
    }

    private void RestartTimer()
    {
        _timer?.Dispose();
        StartTimer();
    }
}
