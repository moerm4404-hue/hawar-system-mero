; Inno Setup Script for Hawr Gallery Management System (نظام إدارة معرض حور)
; Generates standalone Setup-HawrGallery.exe with Update vs Clean Install options

#define MyAppName "نظام إدارة معرض حور"
#define MyAppVersion "2.4.0"
#define MyAppPublisher "Hawr Gallery Inc."
#define MyAppExeName "HawrGallery.exe"

[Setup]
AppId={{E6F7A189-9A4E-4B0D-8B8D-A8A4523B75A1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\HawrGallery
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=dist-installer
OutputBaseFilename=Setup-HawrGallery-v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Dist and bundled server
Source: "dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dist\server.cjs"; DestDir: "{app}\dist"; Flags: ignoreversion
; Never overwrite existing database if update mode is chosen
Source: "data\*"; DestDir: "{app}\data"; Flags: onlyifdoesntexist recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Code]
var
  InstallTypePage: TInputOptionWizardPage;

procedure InitializeWizard;
begin
  // Create Custom Page for "Update (Keep Data)" vs "Clean Install (Fresh DB)"
  InstallTypePage := CreateInputOptionPage(wpWelcome,
    'نوع التثبيت / Installation Mode',
    'اختر نمط التثبيت المطلوب لقاعدة البيانات والبيانات السابقة',
    'يرجى تحديد ما إذا كنت تريد تحديث النظام مع الحفاظ التام على المبيعات والمخزون، أو بدء تثبيت جديد من الصفر:',
    True, False);

  InstallTypePage.Add('تحديث النظام مع الحفاظ على قاعدة البيانات والمخزون الحالي (Update - Keep Data)');
  InstallTypePage.Add('تثبيت نظيف من الصفر ومسح البيانات السابقة (Clean Install - Fresh Start)');
  
  // Default to Safe Update
  InstallTypePage.SelectedValueIndex := 0;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  DataFolder: String;
  BackupFolder: String;
begin
  if CurStep = ssInstall then
  begin
    DataFolder := ExpandConstant('{app}\data');
    BackupFolder := ExpandConstant('{app}\backups_pre_install');

    // If update mode is selected and existing database exists: protect and create automatic backup
    if InstallTypePage.SelectedValueIndex = 0 then
    begin
      if DirExists(DataFolder) then
      begin
        ForceDirectories(BackupFolder);
        FileCopy(DataFolder + '\hawr-gallery.sqlite', BackupFolder + '\hawr-gallery-pre-update.sqlite', False);
      end;
    end
    else if InstallTypePage.SelectedValueIndex = 1 then
    begin
      // Clean install mode selected: backup old db just in case, then clean
      if DirExists(DataFolder) then
      begin
        ForceDirectories(BackupFolder);
        FileCopy(DataFolder + '\hawr-gallery.sqlite', BackupFolder + '\hawr-gallery-pre-clean.sqlite', False);
        DeleteFile(DataFolder + '\hawr-gallery.sqlite');
      end;
    end;
  end;
end;

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
