using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace FlatOut2.Telemetry.ReloadedII;

public sealed class CsvTelemetryWriter : IDisposable
{
    private static readonly string Header = $"{BaseHeader},{BuildWheelHeader()}";
    private const string BaseHeader = "timestamp_utc,sample_index,race_time_seconds,game_state,is_racing,is_paused,level_id,level_name,car_id,car_name,player_steer,player_throttle,player_brake,position_x,position_y,position_z,forward_x,forward_y,forward_z,right_x,right_y,right_z,up_x,up_y,up_z,velocity_x,velocity_y,velocity_z,angular_velocity_x,angular_velocity_y,angular_velocity_z,vehicle_applied_throttle,vehicle_applied_brake,vehicle_applied_handbrake,vehicle_control_candidate_1dfc,vehicle_applied_steer,vehicle_frame_delta_ms,vehicle_frame_delta_seconds,speed_magnitude,planar_speed_magnitude,yaw_radians,yaw_degrees,pitch_radians,pitch_degrees,roll_radians,roll_degrees,yaw_rate,quat_x,quat_y,quat_z,quat_w,camera_position_x,camera_position_y,camera_position_z,camera_forward_x,camera_forward_y,camera_forward_z,camera_fov,camera_mode_index,camera_family,camera_tracker_vtable,camera_tracker_slot_a_vtable,camera_tracker_slot_b_vtable,camera_output_active_profile_ptr,camera_output_active_profile_vtable,camera_output_source_node_ptr,camera_output_target_node_ptr,camera_goal_view_active_profile_ptr,camera_goal_view_active_profile_vtable,camera_goal_view_active_clip_ptr,camera_goal_view_active_clip_vtable,camera_goal_view_source_node_ptr,camera_goal_view_target_node_ptr,camera_goal_view_runtime_seconds,camera_goal_view_dirty_flag,player_camera_list_count,player_camera_active_profile_index,player_camera_list_0_ptr,player_camera_list_0_vtable,player_camera_list_1_ptr,player_camera_list_1_vtable,player_camera_list_2_ptr,player_camera_list_2_vtable,player_camera_list_3_ptr,player_camera_list_3_vtable,player_camera_list_4_ptr,player_camera_list_4_vtable,player_camera_list_5_ptr,player_camera_list_5_vtable";

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
