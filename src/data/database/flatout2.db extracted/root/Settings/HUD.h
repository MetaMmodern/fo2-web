int ViewportPadding = 15;
vec2 MeterOffset = { -145, -140 };
vec2 MeterCenterOffset = { 71.6, 71 };
vec2 NeedlePivot = { 0.5, 0.77 };
vec2 NeedleAngleMinMax = { -0.78, 3.14 };
vec2 NitroBarPivot = { 0.5, 0.575 };
vec2 NitroBarAddPivot = { 49, 0.4 };
vec2 NitroBarAngleMinMax = { -0.78, 3.175 };
float NitroEmitDist = 67;
float NitroFlameDist = 60;
vec2 NitroFlameScale = { 0.9, 0.9 };
float NitroFlameDensity = 0.3;
float NitroFlameRate = 25;
float NitroFlameStartOffset = 10;
float NitroFlameEndOffset = -5;
vec2 SSNitroFlameScale = { 1, 1.75 };
float SSNitroFlameStartOffset = 15;
float SSNitroFlameEndOffset = 10;
vec4 NitroFlameStart = { 0.792157, 0.509804, 0.180392, 0.580392 };
vec4 NitroFlameEnd = { 0.894118, 0.745098, 0.517647, 0.639216 };
float NitroFlameDistort = 0;
vec2 NitroGainOffset = { 0, -80 };
vec2 GearOffset = { 127, 80 };
vec2 SpeedOffset = { 30, 26 };
vec2 UnitTopOffset = { 8, 10 };
vec2 UnitBottomOffset = { 4, 28 };
vec2 SSMeterOffset = { -205, -18 };
vec2 SSSpeedOffset = { 170, -42 };
vec2 DamageOffset = { -5, -51 };
vec2 DamageBaseOffset[] = {
	{ 67, -2 },
	{ 74, 18 },
	{ -57, -2 }
};
vec2 DamageFaceOffset = { 10, -34 };
vec2 DamageBarOffset = { 75, 18 };
vec2 DamageNameOffset = { 75, 18.8 };
float DamageFadeSize = 0.1;
int DamageFadeTime = 750;
int DamageMinTime = 2000;
int DamageDestroyDelay = 1000;
float DamageScanDist = 60;
float DamageScanAngle = 0.23;
float DamageScanCloseDist = 5.5;
vec2 CrashOffset = { 80, -100 };
float CrashIconYOffset = 4;
vec2 StuntOffset = { 2, -145 };
vec2 StuntBaseOffset = { -2, 1 };
vec2 StuntMeterOffset = { -2, 102 };
vec2 StuntMeterAngleOffset = { -2, 102 };
vec2 StuntNeedleOffset = { 2, 98 };
vec2 StuntNeedlePivot = { 0.5, 1.11 };
vec2 StuntAngleMinMax = { 3.14, 1.57 };
vec2 StuntAngleOffset = { 0, 100 };
vec2 StuntAngleNumberOffset[] = {
	{ 71, 90 },
	{ 59, 68 },
	{ 45, 46 },
	{ 28, 31 },
	{ 4, 21 }
};
vec2 StuntControlsOffset = { -170, -1 };
vec2 StuntAftertouchOffset = { 45, -1 };
vec2 StuntArrowOffset[] = {
	{ 12, 0 },
	{ 27, 6 },
	{ 12, 15 },
	{ 0, 6 }
};
vec2 StuntNudgeOffset = { 45, 23 };
vec2 StuntNudgeButtonOffset = { 23, 36 };
vec2 RaceMapOffset = { 6, -205 };
vec2 RaceMapSize = { 128, 128 };
float RaceMapIconSize = 15;
float RaceMapViewDistance = 170;
vec2 DerbyMapOffset = { -40, -290 };
vec2 DerbyMapSize = { 256, 256 };
float DerbyMapIconSize = 15;
float DerbyMapViewDistance = 250;
vec2 PlayerListOffset = { 19, 70 };
float PlayerListNameYSize = 16;
float PlayerListYExtra = 0;
int PlayerListVoiceShowDelay = 1000;
int PlayerListVoiceHideDelay = 2000;
float DamageIndicatorMaxDist = 128;
float DamageIndicatorScale = 0.5;
float DamageIndicatorYOffset = 50;
float DamageIndicatorAlpha = 0.85;
float BGBarLeftWidth[] = {
	130,
	138
};
float BGBarRightWidth[] = {
	130,
	138
};
float BGStuntBarLeftWidth[] = {
	170,
	178
};
float BGStuntBarRightWidth[] = {
	170,
	178
};
float BGDerbyBarLeftWidth[] = {
	140,
	148
};
float BGDerbyBarRightWidth[] = {
	140,
	148
};
float BGTestBarLeftWidth[] = {
	130,
	138
};
float BGTestBarRightWidth[] = {
	130,
	138
};
float BGBarYOffset[] = {
	0,
	24
};
float SSBGBarYOffset[] = {
	-58,
	-34
};
float BGBarPadding = 22;
vec2 RacePositionTitleOffset = { 115, -2 };
vec2 RacePositionOffset = { 124, 22 };
vec2 RaceLapTitleOffset = { -122, -2 };
vec2 RaceLapOffset = { -130, 22 };
float RaceBigFontYOffset = -5;
int RaceLapTime = 1500;
float RaceLapDistance = 200;
float RaceInfoYOffset = 70;
vec2 StuntRoundTitleOffset = { 90, -2 };
vec2 StuntRoundOffset = { 98, -2 };
vec2 StuntScoreTitleOffset = { 90, 22 };
vec2 StuntScoreOffset = { 98, 22 };
int BonusMessageTime = 3000;
vec2 BowlingOffset = { 40, 55 };
vec2 CurlingOffset = { 40, 55 };
vec2 SoccerOffset = { 40, 65 };
vec4 SoccerGoalRect = { 6, 7, 117, 58 };
vec2 SoccerGoalieXRange = { 0.19, 0.91 };
float SoccerGoalieYOffset = 1;
vec2 CardsOffset = { 18, 25 };
vec2 CardSuitOffset = { 18, 4 };
vec2 CardNumberOffset = { 14, 18 };
vec2 CardBonusOffset = { 20, 80 };
int CardBonusWidth = 145;
int CardBonusYSize = 20;
vec2 DartsOffset = { 20, 55 };
vec2 DartsSinglePivot = { 0.5, 1.1 };
vec2 DartsDoublePivot = { 0.5, 5.5 };
vec2 DartsTriplePivot = { 0.5, 2.95 };
vec2 DartsSingleHilitePivot = { 0.5, 1.04 };
vec2 DartsDoubleHilitePivot = { 0.5, 3.66 };
vec2 DartsTripleHilitePivot = { 0.5, 2.03 };
vec2 DerbyMeterOffset = { -220, -53 };
vec2 DerbyDamageOffset = { 0, 21 };
vec2 DerbyNitroOffset = { 0, 0 };
vec2 DerbySpeedOffset = { 174, -42 };
vec2 DerbyBGOffset = { 195, 1 };
vec2 DerbyRemainingTitleOffset = { 125, -2 };
vec2 DerbyRemainingOffset = { 134, 22 };
vec2 DerbyTimeTitleOffset = { -132, -2 };
vec2 DerbyTimeOffset = { -140, 22 };
vec2 TestCarTitleOffset = { 115, -2 };
vec2 TestCarOffset = { 124, 22 };
vec2 TestTopSpeedTitleOffset = { -122, -2 };
vec2 TestTopSpeedOffset = { -62, 18 };
vec2 LiveFriendNotifyPos = { 550, 50 };
vec2 LiveInviteNotifyPos = { 510, 50 };
int ConnectMessageTime = 3000;
int DerbyTimeLeftTime = 60000;
vec2 StuntTutorialHeaderPos = { 320, 100 };
vec2 StuntBufferingOffset = { 400, 25 };
vec2 StuntBufferingIconOffset = { -40, -20 };
