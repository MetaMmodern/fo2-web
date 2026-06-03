float Idle_RPM = 1000;
float OffLow_RPM = 3840;
float OnLow_RPM = 3840;
float OffMid_RPM = 6400;
float OnMid_RPM = 6400;
float OffHigh_RPM = 8960;
float OnHigh_RPM = 8960;
vec3 RPMXFader[] = {
	{ 1, 1000, 3936 },
	{ 0.8, 1000, 5168 },
	{ 0.7, 4266, 7494 },
	{ 0.6, 6224, 9000 }
};
vec3 LoadXFader[] = {
	{ 1, 0, 0.78 },
	{ 1, 0.52, 1 }
};
