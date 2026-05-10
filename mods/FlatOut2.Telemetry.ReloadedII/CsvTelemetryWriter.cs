using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace FlatOut2.Telemetry.ReloadedII;

public sealed class CsvTelemetryWriter : IDisposable
{
    private static readonly string Header = $"{BaseHeader},{BuildWheelHeader()},{BuildWheelOmegaHeader()},{BuildWheelKinematicsHeader()},{BuildWheelAngularProbeHeader()},{BuildDrivetrainProbeHeader()},{BuildVehicleCandidateHeader()},{BuildWheelExtendedHeader()},{BuildWheelDerivedHeader()}";
    private const string BaseHeader = "timestamp_utc,sample_index,race_time_seconds,game_state,is_racing,is_paused,level_id,level_name,car_id,car_name,player_steer,player_throttle,player_brake,position_x,position_y,position_z,forward_x,forward_y,forward_z,right_x,right_y,right_z,up_x,up_y,up_z,velocity_x,velocity_y,velocity_z,angular_velocity_x,angular_velocity_y,angular_velocity_z,vehicle_applied_throttle,vehicle_applied_brake,vehicle_applied_handbrake,vehicle_control_candidate_1dfc,vehicle_applied_steer,vehicle_frame_delta_ms,vehicle_frame_delta_seconds,speed_magnitude,planar_speed_magnitude,orig_speed_forward,orig_engine_rpm_candidate,orig_gear_candidate,orig_clutch_candidate,orig_gear_applied_confirmed,orig_gear_requested_confirmed,orig_gear_shift_state_confirmed,orig_gear_shift_state_candidate_sync_flag,orig_gear_shift_state_candidate_mode_flag,orig_num_gears_confirmed,orig_engine_rpm_like_confirmed,orig_driven_speed_scale_confirmed,orig_auto_shift_speed_threshold_confirmed,yaw_radians,yaw_degrees,pitch_radians,pitch_degrees,roll_radians,roll_degrees,yaw_rate,quat_x,quat_y,quat_z,quat_w,camera_position_x,camera_position_y,camera_position_z,camera_forward_x,camera_forward_y,camera_forward_z,camera_fov,camera_mode_index,camera_family,camera_tracker_vtable,camera_tracker_slot_a_vtable,camera_tracker_slot_b_vtable,camera_output_active_profile_ptr,camera_output_active_profile_vtable,camera_output_source_node_ptr,camera_output_target_node_ptr,camera_goal_view_active_profile_ptr,camera_goal_view_active_profile_vtable,camera_goal_view_active_clip_ptr,camera_goal_view_active_clip_vtable,camera_goal_view_source_node_ptr,camera_goal_view_target_node_ptr,camera_goal_view_runtime_seconds,camera_goal_view_dirty_flag,player_camera_list_count,player_camera_active_profile_index,player_camera_list_0_ptr,player_camera_list_0_vtable,player_camera_list_1_ptr,player_camera_list_1_vtable,player_camera_list_2_ptr,player_camera_list_2_vtable,player_camera_list_3_ptr,player_camera_list_3_vtable,player_camera_list_4_ptr,player_camera_list_4_vtable,player_camera_list_5_ptr,player_camera_list_5_vtable";

    private readonly StreamWriter _writer;

    public CsvTelemetryWriter(string path)
    {
        path = GetTimestampedPath(path);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite);
        _writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false))
        {
            AutoFlush = true
        };
        _writer.WriteLine(Header);
    }

    public void Write(TelemetrySnapshot snapshot)
    {
        var values = new List<string>
        {
            Escape(snapshot.TimestampUtc.ToString("O", CultureInfo.InvariantCulture)),
            snapshot.SampleIndex.ToString(CultureInfo.InvariantCulture),
            snapshot.RaceTimeSeconds.ToString("G17", CultureInfo.InvariantCulture),
            Escape(snapshot.GameState),
            snapshot.IsRacing ? "true" : "false",
            snapshot.IsPaused ? "true" : "false",
            snapshot.LevelId.ToString(CultureInfo.InvariantCulture),
            Escape(snapshot.LevelName),
            snapshot.CarId.ToString(CultureInfo.InvariantCulture),
            Escape(snapshot.CarName),
            snapshot.PlayerSteer.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.PlayerThrottle.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.PlayerBrake.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.PositionX.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.PositionY.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.PositionZ.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.ForwardX.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.ForwardY.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.ForwardZ.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.RightX.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.RightY.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.RightZ.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.UpX.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.UpY.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.UpZ.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.VelocityX.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.VelocityY.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.VelocityZ.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.AngularVelocityX.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.AngularVelocityY.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.AngularVelocityZ.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.VehicleAppliedThrottle.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.VehicleAppliedBrake.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.VehicleAppliedHandbrake.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.VehicleControlCandidate1Dfc.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.VehicleAppliedSteer.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.VehicleFrameDeltaMs.ToString(CultureInfo.InvariantCulture),
            snapshot.VehicleFrameDeltaSeconds.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.SpeedMagnitude.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.PlanarSpeedMagnitude.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.OrigSpeedForward.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.OrigEngineRpmCandidate.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.OrigGearCandidate.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.OrigClutchCandidate.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.OrigGearAppliedConfirmed.ToString(CultureInfo.InvariantCulture),
            snapshot.OrigGearRequestedConfirmed.ToString(CultureInfo.InvariantCulture),
            snapshot.OrigGearShiftStateConfirmed.ToString(CultureInfo.InvariantCulture),
            snapshot.OrigGearShiftStateCandidateSyncFlag.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.OrigGearShiftStateCandidateModeFlag.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.OrigNumGearsConfirmed.ToString(CultureInfo.InvariantCulture),
            snapshot.OrigEngineRpmLikeConfirmed.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.OrigDrivenSpeedScaleConfirmed.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.OrigAutoShiftSpeedThresholdConfirmed.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.YawRadians.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.YawDegrees.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.PitchRadians.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.PitchDegrees.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.RollRadians.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.RollDegrees.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.YawRate.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.QuaternionX.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.QuaternionY.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.QuaternionZ.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.QuaternionW.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.CameraPositionX.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.CameraPositionY.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.CameraPositionZ.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.CameraForwardX.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.CameraForwardY.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.CameraForwardZ.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.CameraFov.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.CameraModeIndex.ToString(CultureInfo.InvariantCulture),
            Escape(snapshot.CameraFamily),
            Escape(snapshot.CameraTrackerVtable),
            Escape(snapshot.CameraTrackerSlotAVtable),
            Escape(snapshot.CameraTrackerSlotBVtable),
            Escape(snapshot.CameraOutputActiveProfilePtr),
            Escape(snapshot.CameraOutputActiveProfileVtable),
            Escape(snapshot.CameraOutputSourceNodePtr),
            Escape(snapshot.CameraOutputTargetNodePtr),
            Escape(snapshot.CameraGoalViewActiveProfilePtr),
            Escape(snapshot.CameraGoalViewActiveProfileVtable),
            Escape(snapshot.CameraGoalViewActiveClipPtr),
            Escape(snapshot.CameraGoalViewActiveClipVtable),
            Escape(snapshot.CameraGoalViewSourceNodePtr),
            Escape(snapshot.CameraGoalViewTargetNodePtr),
            snapshot.CameraGoalViewRuntimeSeconds.ToString("G9", CultureInfo.InvariantCulture),
            snapshot.CameraGoalViewDirtyFlag.ToString(CultureInfo.InvariantCulture),
            snapshot.PlayerCameraListCount.ToString(CultureInfo.InvariantCulture),
            snapshot.PlayerCameraActiveProfileIndex.ToString(CultureInfo.InvariantCulture),
            Escape(snapshot.PlayerCameraList0Ptr),
            Escape(snapshot.PlayerCameraList0Vtable),
            Escape(snapshot.PlayerCameraList1Ptr),
            Escape(snapshot.PlayerCameraList1Vtable),
            Escape(snapshot.PlayerCameraList2Ptr),
            Escape(snapshot.PlayerCameraList2Vtable),
            Escape(snapshot.PlayerCameraList3Ptr),
            Escape(snapshot.PlayerCameraList3Vtable),
            Escape(snapshot.PlayerCameraList4Ptr),
            Escape(snapshot.PlayerCameraList4Vtable),
            Escape(snapshot.PlayerCameraList5Ptr),
            Escape(snapshot.PlayerCameraList5Vtable)
        };

        AppendWheelValues(values, snapshot);
        AppendWheelOmegaValues(values, snapshot);
        AppendWheelKinematics(values, snapshot);
        AppendWheelAngularProbes(values, snapshot);
        AppendDrivetrainProbes(values, snapshot);
        AppendVehicleCandidateValues(values, snapshot);
        AppendWheelExtendedValues(values, snapshot);
        AppendWheelDerivedValues(values, snapshot);
        _writer.WriteLine(string.Join(",", values));
    }

    public void Dispose()
    {
        _writer.Dispose();
    }

    private static string Escape(string value)
    {
        var sanitized = value.Replace("\r", " ").Replace("\n", " ");
        if (sanitized.Contains('"'))
            sanitized = sanitized.Replace("\"", "\"\"");

        if (sanitized.IndexOfAny(new[] { ',', '"' }) >= 0)
            return $"\"{sanitized}\"";

        return sanitized;
    }

    private static string BuildWheelHeader()
    {
        string[] fieldNames =
        {
            "contact_flag",
            "contact_ptr",
            "contact_surface_44_candidate",
            "contact_surface_48_candidate",
            "contact_surface_4c_candidate",
            "contact_surface_50_candidate",
            "contact_surface_54_candidate",
            "suspension_length_candidate",
            "tire_force_multiplier_candidate",
            "load_or_spin_candidate",
            "rotation_or_phase_candidate",
            "vertical_load_candidate"
        };

        return string.Join(",", Enumerable.Range(0, 4).SelectMany(i => fieldNames.Select(name => $"wheel_{i}_{name}")));
    }

    private static void AppendWheelValues(List<string> values, TelemetrySnapshot snapshot)
    {
        for (var i = 0; i < 4; i++)
        {
            values.Add(GetInt(snapshot.WheelContactFlags, i).ToString(CultureInfo.InvariantCulture));
            values.Add(Escape(GetString(snapshot.WheelContactPtrs, i)));
            values.Add(GetFloat(snapshot.WheelContactSurface44Candidates, i).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelContactSurface48Candidates, i).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelContactSurface4CCandidates, i).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelContactSurface50Candidates, i).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelContactSurface54Candidates, i).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelSuspensionLengthCandidates, i).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelTireForceMultiplierCandidates, i).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelLoadOrSpinCandidates, i).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelRotationOrPhaseCandidates, i).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelVerticalLoadCandidates, i).ToString("G9", CultureInfo.InvariantCulture));
        }
    }

    private static string BuildWheelOmegaHeader()
    {
        string[] names =
        {
            "omega_from_phase_rad_s",
            "omega_from_phase_rpm"
        };
        return string.Join(",", Enumerable.Range(0, 4).SelectMany(i => names.Select(name => $"wheel_{i}_{name}")));
    }

    private static void AppendWheelOmegaValues(List<string> values, TelemetrySnapshot snapshot)
    {
        for (var i = 0; i < 4; i++)
        {
            values.Add(GetFloat(snapshot.WheelOmegaFromPhaseRadPerSec, i).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelOmegaFromPhaseRpm, i).ToString("G9", CultureInfo.InvariantCulture));
        }
    }

    private static string BuildVehicleCandidateHeader()
    {
        var offsets =
            new[] { 0x1DE8, 0x1DEC, 0x1DF0, 0x1E08, 0x1E0C, 0x1E10, 0x1E14, 0x1E18, 0x1E1C, 0x1E20, 0x1E24, 0x1E28 };
        return string.Join(",", offsets.Select(offset => $"vehicle_candidate_{offset:x4}"));
    }

    private static string BuildWheelKinematicsHeader()
    {
        string[] names =
        {
            "rate_denominator_confirmed_030c",
            "rate_from_drivetrain_confirmed_031c",
            "brake_torque_confirmed_0320",
            "omega_or_phase_candidate_032c"
        };
        return string.Join(",", Enumerable.Range(0, 4).SelectMany(i => names.Select(name => $"wheel_{i}_{name}")));
    }

    private static void AppendWheelKinematics(List<string> values, TelemetrySnapshot snapshot)
    {
        for (var i = 0; i < 4; i++)
        {
            var baseIndex = i * 4;
            values.Add(GetFloat(snapshot.WheelKinematicsConfirmed, baseIndex + 0).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelKinematicsConfirmed, baseIndex + 1).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelKinematicsConfirmed, baseIndex + 2).ToString("G9", CultureInfo.InvariantCulture));
            values.Add(GetFloat(snapshot.WheelKinematicsConfirmed, baseIndex + 3).ToString("G9", CultureInfo.InvariantCulture));
        }
    }

    private static string BuildWheelAngularProbeHeader()
    {
        var offsets =
            new[] { 0x0300, 0x0304, 0x0308, 0x030C, 0x0310, 0x0314, 0x0318, 0x031C, 0x0320, 0x0324, 0x0328, 0x032C, 0x0330, 0x0334, 0x0338, 0x033C, 0x0340, 0x0344, 0x0348, 0x034C, 0x0350, 0x0354, 0x0358, 0x035C };
        return string.Join(",", Enumerable.Range(0, 4).SelectMany(i => offsets.Select(offset => $"wheel_{i}_angular_probe_{offset:x4}")));
    }

    private static void AppendWheelAngularProbes(List<string> values, TelemetrySnapshot snapshot)
    {
        for (var i = 0; i < 96; i++)
        {
            values.Add(GetFloat(snapshot.WheelAngularVelocityProbeCandidates, i).ToString("G9", CultureInfo.InvariantCulture));
        }
    }

    private static string BuildDrivetrainProbeHeader()
    {
        string[] names =
        {
            "vehicle_gear_node0_ptr_0380",
            "vehicle_gear_node1_ptr_0488",
            "vehicle_gear_node2_ptr_0590",
            "vehicle_wheel_rate_aggregate_candidate_03a4",
            "node0_rate_002c",
            "node1_rate_002c",
            "node2_rate_002c",
            "node0_accum_0038",
            "node1_accum_0038",
            "node2_accum_0038",
            "node0_torque_003c",
            "node1_torque_003c",
            "node2_torque_003c",
        };
        return string.Join(",", names);
    }

    private static void AppendDrivetrainProbes(List<string> values, TelemetrySnapshot snapshot)
    {
        for (var i = 0; i < 13; i++)
        {
            values.Add(GetFloat(snapshot.DrivetrainRateProbeCandidates, i).ToString("G9", CultureInfo.InvariantCulture));
        }
    }

    private static string BuildWheelExtendedHeader()
    {
        var offsets =
            new[] { 0x0320, 0x0324, 0x0328, 0x0338, 0x0344, 0x036C, 0x0370, 0x0374, 0x037C, 0x0380, 0x0384, 0x038C, 0x0390, 0x0394, 0x0398, 0x039C };
        return string.Join(
            ",",
            Enumerable.Range(0, 4).SelectMany(i => offsets.Select(offset => $"wheel_{i}_candidate_{offset:x4}")));
    }

    private static void AppendVehicleCandidateValues(List<string> values, TelemetrySnapshot snapshot)
    {
        for (var i = 0; i < 12; i++)
        {
            values.Add(GetFloat(snapshot.VehicleCandidateFloats, i).ToString("G9", CultureInfo.InvariantCulture));
        }
    }

    private static void AppendWheelExtendedValues(List<string> values, TelemetrySnapshot snapshot)
    {
        for (var i = 0; i < 64; i++)
        {
            values.Add(GetFloat(snapshot.WheelExtendedCandidates, i).ToString("G9", CultureInfo.InvariantCulture));
        }
    }

    private static string BuildWheelDerivedHeader()
    {
        string[] names =
        {
            "suspension_length_delta_per_sec",
            "load_or_spin_delta_per_sec",
            "vertical_load_delta_per_sec",
        };
        return string.Join(",", Enumerable.Range(0, 4).SelectMany(i => names.Select(name => $"wheel_{i}_{name}")));
    }

    private static void AppendWheelDerivedValues(List<string> values, TelemetrySnapshot snapshot)
    {
        for (var i = 0; i < 12; i++)
        {
            values.Add(GetFloat(snapshot.WheelDerivedCandidates, i).ToString("G9", CultureInfo.InvariantCulture));
        }
    }

    private static int GetInt(int[] values, int index) =>
        values != null && index >= 0 && index < values.Length ? values[index] : 0;

    private static float GetFloat(float[] values, int index) =>
        values != null && index >= 0 && index < values.Length ? values[index] : 0.0f;

    private static string GetString(string[] values, int index) =>
        values != null && index >= 0 && index < values.Length ? values[index] : string.Empty;

    private static string GetTimestampedPath(string path)
    {
        var directory = Path.GetDirectoryName(path)!;
        var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(path);
        var extension = Path.GetExtension(path);
        return Path.Combine(directory, $"{fileNameWithoutExtension}.{DateTime.UtcNow:yyyyMMdd-HHmmss}{extension}");
    }
}
