float Idle_RPM = 1000;
float OffLow_RPM = 3150;
float OnLow_RPM = 3150;
float OffMid_RPM = 5250;
float OnMid_RPM = 5250;
float OffHigh_RPM = 6825;
float OnHigh_RPM = 6825;
vec3 RPMXFader[] = {
	{ 1, 1000, 1470 },
	{ 0.8, 1000, 3277 },
	{ 0.7, 1985, 5903 },
	{ 0.6, 3768, 6825 }
};
vec3 LoadXFader[] = {
	{ 1, 0, 0.78 },
	{ 1, 0.52, 1 }
};
