//! GUI Module for Employee Information Management
//!
//! Provides a simple GUI for:
//! - Initial setup (employee name, ID, admin password)
//! - Settings update (change employee info)
//! - System tray integration

use crate::modules::employee_info::{EmployeeInfo, EmployeeInfoManager};
use crate::modules::error::{MonitoringError, Result};
use crate::modules::otp_client::OTPClient;
use parking_lot::RwLock;
use std::sync::Arc;
use tracing::{error, info};

/// Navigation result for multi-step dialogs
#[derive(Debug)]
enum NavigationResult {
    Next(String),
    Back,
    Cancel,
}

/// The themed WPF dialog controller, run by a single STA PowerShell process.
///
/// It reads all dynamic content from environment variables (set by
/// `run_themed_window`) so nothing is string-interpolated into the script:
///   VS_KIND      = "input" | "message"
///   VS_LEVEL     = "error" | "success" | "info" | "about"   (message kind only)
///   VS_HEADING   = large title line
///   VS_STEP      = optional "Step X/Y" chip text ("" hides it)
///   VS_BODY      = body text (may contain real newlines)
///   VS_DEFAULT   = prefilled input value            (input kind only)
///   VS_ALLOWBACK = "1" | "0"                         (input kind only)
///   VS_PASSWORD  = "1" | "0" mask the field          (input kind only)
///   VS_PRIMARY_LABEL = primary action text              (input kind only)
///
/// On stdout it prints exactly one line:
///   input   -> "NEXT\x01<value>" | "BACK" | "CANCEL"
///   message -> "OK"
///
/// The visual language mirrors the dashboard's mission-control theme:
/// deep navy backdrop, a raised card surface, an electric-blue primary accent,
/// a cyan signal highlight, Segoe UI, rounded corners and soft borders.
#[cfg(target_os = "windows")]
const THEMED_DIALOG_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

function EnvOr($n, $d) { $v = [Environment]::GetEnvironmentVariable($n); if ([string]::IsNullOrEmpty($v)) { return $d } else { return $v } }

$kind     = EnvOr 'VS_KIND' 'message'
$level    = EnvOr 'VS_LEVEL' 'info'
$heading  = EnvOr 'VS_HEADING' 'ScreenTime'
$step     = EnvOr 'VS_STEP' ''
$body     = EnvOr 'VS_BODY' ''
$default  = EnvOr 'VS_DEFAULT' ''
$allowBack = (EnvOr 'VS_ALLOWBACK' '0') -eq '1'
$isPass    = (EnvOr 'VS_PASSWORD' '0') -eq '1'
$primaryLabel = EnvOr 'VS_PRIMARY_LABEL' 'Continue'

# Mission-control palette (matches the dashboard tokens).
$cBg        = '#070B14'   # window backdrop
$cCard      = '#0F1A2E'   # card surface
$cCard2     = '#132239'   # field / raised surface
$cBorder    = '#22314F'   # hairline border
$cText      = '#E8EEF9'   # primary text
$cMuted     = '#8CA0BF'   # muted text
$cPrimary   = '#3B82F6'   # electric blue
$cPrimary2  = '#2563EB'
$cSignal    = '#22D3EE'   # cyan
$accent = $cPrimary
$glyph  = "`u{2699}"       # gear
switch ($level) {
  'error'   { $accent = '#F87171'; $glyph = "`u{26A0}" }   # warning triangle
  'success' { $accent = '#34D399'; $glyph = "`u{2714}" }   # check
  'info'    { $accent = $cSignal;  $glyph = "`u{2139}" }   # info
  'about'   { $accent = $cPrimary; $glyph = "`u{25C8}" }   # diamond
}
if ($kind -eq 'input') { $accent = $cPrimary; $glyph = "`u{25C8}" }

# Build the button row for the current kind.
if ($kind -eq 'input') {
  $backVis = if ($allowBack) { 'Visible' } else { 'Collapsed' }
  $buttonsXaml = @"
      <Button x:Name='BtnCancel' Content='Cancel' Style='{StaticResource Ghost}' Margin='0,0,10,0'/>
      <Button x:Name='BtnBack' Content='Back' Style='{StaticResource Ghost}' Margin='0,0,10,0' Visibility='$backVis'/>
      <Button x:Name='BtnNext' Content='$primaryLabel' Style='{StaticResource Primary}'/>
"@
  $inputVis = 'Visible'
} else {
  $buttonsXaml = "<Button x:Name='BtnNext' Content='OK' Style='{StaticResource Primary}'/>"
  $inputVis = 'Collapsed'
}
$stepVis = if ([string]::IsNullOrEmpty($step)) { 'Collapsed' } else { 'Visible' }

$xaml = @"
<Window xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'
        xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml'
        Title='ScreenTime' WindowStartupLocation='CenterScreen'
        SizeToContent='Height' Width='460' ResizeMode='NoResize'
        WindowStyle='None' AllowsTransparency='True' Background='Transparent'
        Topmost='True' FontFamily='Segoe UI'>
  <Window.Resources>
    <Style x:Key='Primary' TargetType='Button'>
      <Setter Property='Foreground' Value='White'/>
      <Setter Property='FontSize' Value='13'/>
      <Setter Property='FontWeight' Value='SemiBold'/>
      <Setter Property='Cursor' Value='Hand'/>
      <Setter Property='Padding' Value='18,9'/>
      <Setter Property='Template'>
        <Setter.Value>
          <ControlTemplate TargetType='Button'>
            <Border x:Name='b' CornerRadius='9' Padding='{TemplateBinding Padding}'>
              <Border.Background>
                <LinearGradientBrush StartPoint='0,0' EndPoint='0,1'>
                  <GradientStop Color='$cPrimary' Offset='0'/>
                  <GradientStop Color='$cPrimary2' Offset='1'/>
                </LinearGradientBrush>
              </Border.Background>
              <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property='IsMouseOver' Value='True'>
                <Setter TargetName='b' Property='Opacity' Value='0.9'/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key='Ghost' TargetType='Button'>
      <Setter Property='Foreground' Value='$cMuted'/>
      <Setter Property='FontSize' Value='13'/>
      <Setter Property='FontWeight' Value='SemiBold'/>
      <Setter Property='Cursor' Value='Hand'/>
      <Setter Property='Padding' Value='16,9'/>
      <Setter Property='Template'>
        <Setter.Value>
          <ControlTemplate TargetType='Button'>
            <Border x:Name='b' CornerRadius='9' Background='#0E1626'
                    BorderBrush='$cBorder' BorderThickness='1' Padding='{TemplateBinding Padding}'>
              <ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property='IsMouseOver' Value='True'>
                <Setter TargetName='b' Property='Background' Value='#182740'/>
                <Setter Property='Foreground' Value='$cText'/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>

  <Border CornerRadius='16' Background='$cBg' BorderBrush='$cBorder' BorderThickness='1' Margin='12'>
    <Border.Effect>
      <DropShadowEffect BlurRadius='34' ShadowDepth='0' Opacity='0.6' Color='#000000'/>
    </Border.Effect>
    <Grid>
      <Grid.RowDefinitions>
        <RowDefinition Height='Auto'/>
        <RowDefinition Height='Auto'/>
        <RowDefinition Height='Auto'/>
      </Grid.RowDefinitions>

      <!-- Accent top bar (draggable) -->
      <Border x:Name='TitleBar' Grid.Row='0' CornerRadius='16,16,0,0' Height='6'>
        <Border.Background>
          <LinearGradientBrush StartPoint='0,0' EndPoint='1,0'>
            <GradientStop Color='$accent' Offset='0'/>
            <GradientStop Color='$cSignal' Offset='1'/>
          </LinearGradientBrush>
        </Border.Background>
      </Border>

      <!-- Header -->
      <Grid Grid.Row='1' Margin='26,22,26,4'>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width='Auto'/>
          <ColumnDefinition Width='*'/>
          <ColumnDefinition Width='Auto'/>
        </Grid.ColumnDefinitions>
        <Border Grid.Column='0' Width='46' Height='46' CornerRadius='12' Background='$cCard2'
                BorderBrush='$cBorder' BorderThickness='1' VerticalAlignment='Top'>
          <TextBlock Text='$glyph' Foreground='$accent' FontSize='22'
                     HorizontalAlignment='Center' VerticalAlignment='Center'/>
        </Border>
        <StackPanel Grid.Column='1' Margin='14,0,0,0' VerticalAlignment='Center'>
          <TextBlock Text='$heading' Foreground='$cText' FontSize='18' FontWeight='SemiBold' TextWrapping='Wrap'/>
          <TextBlock Text='ScreenTime Monitoring' Foreground='$cMuted' FontSize='11' Margin='0,2,0,0'
                     TextOptions.TextFormattingMode='Ideal' FontWeight='SemiBold'/>
        </StackPanel>
        <Border Grid.Column='2' x:Name='StepChip' Visibility='$stepVis' VerticalAlignment='Top'
                CornerRadius='999' Background='#10203A' BorderBrush='$cBorder' BorderThickness='1'
                Padding='11,5'>
          <TextBlock Text='$step' Foreground='$cSignal' FontSize='11' FontWeight='SemiBold'/>
        </Border>
      </Grid>

      <!-- Body + input + buttons -->
      <StackPanel Grid.Row='2' Margin='26,10,26,24'>
        <Border Background='$cCard' CornerRadius='12' BorderBrush='$cBorder' BorderThickness='1' Padding='16,14'>
          <TextBlock Text='$body' Foreground='$cMuted' FontSize='13' TextWrapping='Wrap' LineHeight='19'/>
        </Border>

        <Border x:Name='FieldWrap' Visibility='$inputVis' Margin='0,14,0,0'
                Background='$cCard2' CornerRadius='11' BorderBrush='$cBorder' BorderThickness='1' Padding='4'>
          <Grid>
            <TextBox x:Name='Field' Background='Transparent' Foreground='$cText' CaretBrush='$cSignal'
                     BorderThickness='0' FontSize='15' Padding='12,10' VerticalContentAlignment='Center'/>
            <PasswordBox x:Name='FieldPass' Background='Transparent' Foreground='$cText' CaretBrush='$cSignal'
                     BorderThickness='0' FontSize='15' Padding='12,10' VerticalContentAlignment='Center'
                     Visibility='Collapsed'/>
          </Grid>
        </Border>

        <StackPanel Orientation='Horizontal' HorizontalAlignment='Right' Margin='0,20,0,0'>
$buttonsXaml
        </StackPanel>
      </StackPanel>
    </Grid>
  </Border>
</Window>
"@

[xml]$xmlDoc = $xaml
$reader = New-Object System.Xml.XmlNodeReader $xmlDoc
$win = [Windows.Markup.XamlReader]::Load($reader)

$result = 'CANCEL'
$btnNext = $win.FindName('BtnNext')
$btnBack = $win.FindName('BtnBack')
$btnCancel = $win.FindName('BtnCancel')
$field = $win.FindName('Field')
$fieldPass = $win.FindName('FieldPass')
$titleBar = $win.FindName('TitleBar')

if ($titleBar) { $titleBar.Add_MouseLeftButtonDown({ $win.DragMove() }) }

function Get-Value {
  if ($isPass) { return $fieldPass.Password } else { return $field.Text }
}

if ($kind -eq 'input') {
  if ($isPass) {
    $field.Visibility = 'Collapsed'
    $fieldPass.Visibility = 'Visible'
    $win.Add_Loaded({ $fieldPass.Focus() | Out-Null })
  } else {
    $field.Text = $default
    $win.Add_Loaded({ $field.Focus() | Out-Null; $field.SelectAll() })
  }
  $btnNext.Add_Click({ $script:result = 'NEXT' + [char]1 + (Get-Value); $win.Close() })
  if ($btnBack) { $btnBack.Add_Click({ $script:result = 'BACK'; $win.Close() }) }
  if ($btnCancel) { $btnCancel.Add_Click({ $script:result = 'CANCEL'; $win.Close() }) }
  # Enter submits, Esc cancels.
  $win.Add_KeyDown({
    if ($_.Key -eq 'Return') { $script:result = 'NEXT' + [char]1 + (Get-Value); $win.Close() }
    elseif ($_.Key -eq 'Escape') { $script:result = 'CANCEL'; $win.Close() }
  })
} else {
  $btnNext.Add_Click({ $script:result = 'OK'; $win.Close() })
  $win.Add_KeyDown({ if ($_.Key -eq 'Return' -or $_.Key -eq 'Escape') { $script:result = 'OK'; $win.Close() } })
  $win.Add_Loaded({ $btnNext.Focus() | Out-Null })
}

$win.ShowDialog() | Out-Null
[Console]::Out.Write($result)
"#;

/// The themed tray context menu — a cursor-anchored WPF popup styled like the
/// mission-control GUI, replacing the old native Win32 tray menu. Reads:
///   VS_PAUSED   = "1" | "0"   (chooses Pause vs Resume row)
///   VS_SUBTITLE = employee line shown under the title
/// Prints the chosen action id on stdout: settings|about|pause|resume|stop
/// (empty if dismissed by clicking away / pressing Esc).
#[cfg(target_os = "windows")]
const THEMED_TRAY_MENU_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

function EnvOr($n, $d) { $v = [Environment]::GetEnvironmentVariable($n); if ([string]::IsNullOrEmpty($v)) { return $d } else { return $v } }
$paused   = (EnvOr 'VS_PAUSED' '0') -eq '1'
$subtitle = EnvOr 'VS_SUBTITLE' 'ScreenTime'

# Palette (matches the dashboard / themed dialogs).
$cBg     = '#070B14'
$cCard   = '#0F1A2E'
$cBorder = '#22314F'
$cText   = '#E8EEF9'
$cMuted  = '#8CA0BF'
$cPrimary= '#3B82F6'
$cSignal = '#22D3EE'
$cDanger = '#F87171'

# Pause vs Resume row.
if ($paused) { $ppId='resume'; $ppLabel='Resume Monitoring'; $ppGlyph=[char]0x25B6 } else { $ppId='pause'; $ppLabel='Pause Monitoring'; $ppGlyph=[char]0x23F8 }

$xaml = @"
<Window xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'
        xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml'
        WindowStartupLocation='Manual' SizeToContent='WidthAndHeight'
        WindowStyle='None' AllowsTransparency='True' Background='Transparent'
        Topmost='True' ShowInTaskbar='False' FontFamily='Segoe UI'>
  <Window.Resources>
    <Style x:Key='Row' TargetType='Button'>
      <Setter Property='HorizontalContentAlignment' Value='Left'/>
      <Setter Property='Foreground' Value='$cText'/>
      <Setter Property='FontSize' Value='13'/>
      <Setter Property='FontWeight' Value='SemiBold'/>
      <Setter Property='Cursor' Value='Hand'/>
      <Setter Property='Padding' Value='12,9'/>
      <Setter Property='Template'>
        <Setter.Value>
          <ControlTemplate TargetType='Button'>
            <Border x:Name='b' CornerRadius='9' Background='Transparent' Padding='{TemplateBinding Padding}'>
              <ContentPresenter VerticalAlignment='Center'/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property='IsMouseOver' Value='True'>
                <Setter TargetName='b' Property='Background' Value='#17253C'/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>

  <Border CornerRadius='14' Background='$cBg' BorderBrush='$cBorder' BorderThickness='1' Margin='10' Width='264'>
    <Border.Effect><DropShadowEffect BlurRadius='30' ShadowDepth='0' Opacity='0.6' Color='#000000'/></Border.Effect>
    <StackPanel Margin='8'>
      <!-- Header -->
      <Grid Margin='6,6,6,10'>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width='Auto'/>
          <ColumnDefinition Width='*'/>
        </Grid.ColumnDefinitions>
        <Border Grid.Column='0' Width='38' Height='38' CornerRadius='10'>
          <Border.Background>
            <LinearGradientBrush StartPoint='0,0' EndPoint='1,1'>
              <GradientStop Color='#4F6DF5' Offset='0'/>
              <GradientStop Color='#18A8C7' Offset='1'/>
            </LinearGradientBrush>
          </Border.Background>
          <Canvas Width='24' Height='24' HorizontalAlignment='Center' VerticalAlignment='Center'>
            <Path Stroke='White' StrokeThickness='1.7' StrokeStartLineCap='Round' StrokeEndLineCap='Round' Data='M2.29 9.62A10 10 0 1 0 21.31 8.35'/>
            <Path Stroke='White' StrokeThickness='1.7' StrokeStartLineCap='Round' StrokeEndLineCap='Round' Data='M16.24 7.76A6 6 0 1 0 8.23 16.67'/>
            <Ellipse Canvas.Left='10' Canvas.Top='10' Width='4' Height='4' Stroke='White' StrokeThickness='1.7'/>
            <Path Stroke='White' StrokeThickness='1.7' StrokeStartLineCap='Round' StrokeEndLineCap='Round' Data='M13.41 10.59 19.07 4.93'/>
          </Canvas>
        </Border>
        <StackPanel Grid.Column='1' Margin='10,0,0,0' VerticalAlignment='Center'>
          <TextBlock Text='ScreenTime' Foreground='$cText' FontSize='14' FontWeight='Bold'/>
          <TextBlock Text='$subtitle' Foreground='$cMuted' FontSize='11' TextTrimming='CharacterEllipsis'/>
        </StackPanel>
      </Grid>

      <Border Height='1' Background='$cBorder' Margin='4,0,4,6'/>

      <Button x:Name='BtnStats' Style='{StaticResource Row}'>
        <StackPanel Orientation='Horizontal'>
          <TextBlock Text='&#x1F4CA;' FontSize='15' Foreground='$cPrimary' Width='24'/>
          <TextBlock Text='View Your Stats' FontWeight='Bold' VerticalAlignment='Center'/>
        </StackPanel>
      </Button>

      <Button x:Name='BtnSettings' Style='{StaticResource Row}'>
        <StackPanel Orientation='Horizontal'>
          <TextBlock Text='&#x2699;' FontSize='15' Foreground='$cSignal' Width='24'/>
          <TextBlock Text='Update Information' VerticalAlignment='Center'/>
        </StackPanel>
      </Button>
      <Button x:Name='BtnAbout' Style='{StaticResource Row}'>
        <StackPanel Orientation='Horizontal'>
          <TextBlock Text='&#x2139;' FontSize='15' Foreground='$cSignal' Width='24'/>
          <TextBlock Text='About' VerticalAlignment='Center'/>
        </StackPanel>
      </Button>
      <Button x:Name='BtnPause' Style='{StaticResource Row}'>
        <StackPanel Orientation='Horizontal'>
          <TextBlock Text='$ppGlyph' FontSize='14' Foreground='$cPrimary' Width='24'/>
          <TextBlock Text='$ppLabel' VerticalAlignment='Center'/>
        </StackPanel>
      </Button>

      <Border Height='1' Background='$cBorder' Margin='4,6,4,6'/>

      <Button x:Name='BtnStop' Style='{StaticResource Row}'>
        <StackPanel Orientation='Horizontal'>
          <TextBlock Text='&#x23FB;' FontSize='15' Foreground='$cDanger' Width='24'/>
          <TextBlock Text='Stop Monitoring' Foreground='$cDanger' VerticalAlignment='Center'/>
        </StackPanel>
      </Button>
    </StackPanel>
  </Border>
</Window>
"@

[xml]$doc = $xaml
$reader = New-Object System.Xml.XmlNodeReader $doc
$win = [Windows.Markup.XamlReader]::Load($reader)

$script:result = ''
$pick = { param($id) $script:result = $id; $win.Close() }
$win.FindName('BtnStats').Add_Click({ & $pick 'stats' })
$win.FindName('BtnSettings').Add_Click({ & $pick 'settings' })
$win.FindName('BtnAbout').Add_Click({ & $pick 'about' })
$win.FindName('BtnPause').Add_Click({ & $pick $ppId })
$win.FindName('BtnStop').Add_Click({ & $pick 'stop' })
$win.Add_KeyDown({ if ($_.Key -eq 'Escape') { $win.Close() } })
# Dismiss when focus is lost (click elsewhere), like a real context menu — but
# only once the window has actually been activated, otherwise an initial
# unfocused open would instantly dismiss it.
$script:activated = $false
$win.Add_Activated({ $script:activated = $true })
$win.Add_Deactivated({ if ($script:activated) { $win.Close() } })

# Position near the mouse cursor, kept on-screen.
$win.Add_SourceInitialized({
  $pos = [System.Windows.Forms.Cursor]::Position
  $wa = [System.Windows.Forms.Screen]::FromPoint($pos).WorkingArea
  $w = 284; $h = 360
  $left = [Math]::Min($pos.X, $wa.Right - $w)
  $top  = [Math]::Min($pos.Y, $wa.Bottom - $h)
  $win.Left = [Math]::Max($wa.Left, $left)
  $win.Top  = [Math]::Max($wa.Top, $top - $h)
  $win.Activate() | Out-Null
})

$win.ShowDialog() | Out-Null
[Console]::Out.Write($script:result)
"#;

/// GUI state
pub struct GuiState {
    /// Employee info manager
    pub info_manager: Arc<EmployeeInfoManager>,

    /// OTP client
    pub otp_client: Arc<OTPClient>,

    /// Current employee info (if loaded)
    pub current_info: Arc<RwLock<Option<EmployeeInfo>>>,

    /// Callback for info updates
    pub on_info_updated: Arc<RwLock<Option<Box<dyn Fn(EmployeeInfo) + Send + Sync>>>>,
}

impl GuiState {
    /// Create new GUI state
    pub fn new(info_manager: Arc<EmployeeInfoManager>, otp_client: Arc<OTPClient>) -> Self {
        let current_info = if let Ok(info) = info_manager.load_info() {
            Some(info)
        } else {
            None
        };

        Self {
            info_manager,
            otp_client,
            current_info: Arc::new(RwLock::new(current_info)),
            on_info_updated: Arc::new(RwLock::new(None)),
        }
    }

    /// Request OTP synchronously (spawns async task and waits)
    fn request_otp_sync(
        &self,
        client_id: &str,
        employee_name: &str,
        employee_id: &str,
    ) -> Result<String> {
        let otp_client = Arc::clone(&self.otp_client);
        let client_id = client_id.to_string();
        let employee_name = employee_name.to_string();
        let employee_id = employee_id.to_string();

        // Spawn a new task and wait for it
        let result = std::thread::spawn(move || {
            tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(async move {
                    otp_client
                        .request_otp(&client_id, &employee_name, &employee_id)
                        .await
                })
        })
        .join();

        match result {
            Ok(r) => r,
            Err(_) => Err(MonitoringError::Config("Failed to request OTP".to_string())),
        }
    }

    /// Verify OTP synchronously (spawns async task and waits)
    fn verify_otp_sync(&self, client_id: &str, otp: &str) -> Result<()> {
        let otp_client = Arc::clone(&self.otp_client);
        let client_id = client_id.to_string();
        let otp = otp.to_string();

        // Spawn a new task and wait for it
        let result = std::thread::spawn(move || {
            tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(async move { otp_client.verify_otp(&client_id, &otp).await })
        })
        .join();

        match result {
            Ok(r) => r,
            Err(_) => Err(MonitoringError::Config("Failed to verify OTP".to_string())),
        }
    }

    /// Set callback for info updates
    pub fn set_on_info_updated<F>(&self, callback: F)
    where
        F: Fn(EmployeeInfo) + Send + Sync + 'static,
    {
        *self.on_info_updated.write() = Some(Box::new(callback));
    }

    /// Show setup dialog (first time)
    #[cfg(target_os = "windows")]
    pub fn show_setup_dialog(&self) -> Result<EmployeeInfo> {
        info!("📋 Showing initial setup dialog");

        // Store answers for navigation
        let mut employee_name = String::new();
        let mut employee_id = String::new();
        let mut password = String::new();
        let mut current_step = 1;

        loop {
            match current_step {
                1 => {
                    // Step 1: Get employee name
                    let prompt = if employee_name.is_empty() {
                        "Enter your full name:".to_string()
                    } else {
                        format!("Enter your full name:$([char]13)$([char]10)$([char]13)$([char]10)Current value: {}$([char]13)$([char]10)$([char]13)$([char]10)Click [Yes] to continue (you can keep or change it on the next screen).", employee_name)
                    };

                    match self.prompt_input_with_navigation(
                        "Employee Setup - Step 1/4",
                        &prompt,
                        &employee_name,
                        false,
                    ) {
                        NavigationResult::Next(name) if !name.trim().is_empty() => {
                            employee_name = name.trim().to_string();
                            current_step = 2;
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("Setup Required", "Employee name cannot be empty.");
                        }
                        NavigationResult::Back => {
                            // Can't go back from step 1
                            self.show_info(
                                "First Step",
                                "This is the first step. Please enter your name to continue.",
                            );
                        }
                        NavigationResult::Cancel => {
                            std::process::exit(0);
                        }
                    }
                }
                2 => {
                    // Step 2: Get employee ID
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)$([char]13)$([char]10)", employee_name);
                    let prompt = if employee_id.is_empty() {
                        format!("{}Enter your employee ID:", summary)
                    } else {
                        format!("{}Enter your employee ID:$([char]13)$([char]10)$([char]13)$([char]10)Current value: {}$([char]13)$([char]10)$([char]13)$([char]10)Click [Yes] to continue (you can keep or change it on the next screen).", summary, employee_id)
                    };

                    match self.prompt_input_with_navigation(
                        "Employee Setup - Step 2/4",
                        &prompt,
                        &employee_id,
                        true,
                    ) {
                        NavigationResult::Next(id) if !id.trim().is_empty() => {
                            employee_id = id.trim().to_string();
                            current_step = 3;
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("Setup Required", "Employee ID cannot be empty.");
                        }
                        NavigationResult::Back => {
                            current_step = 1;
                        }
                        NavigationResult::Cancel => {
                            std::process::exit(0);
                        }
                    }
                }
                3 => {
                    // Step 3: Get admin password and verify
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)  - Employee ID: {}$([char]13)$([char]10)$([char]13)$([char]10)", employee_name, employee_id);
                    let prompt = format!("{}Enter admin password:", summary);

                    match self.prompt_input_with_navigation(
                        "Employee Setup - Step 3/4",
                        &prompt,
                        "",
                        true,
                    ) {
                        NavigationResult::Next(pwd) if !pwd.is_empty() => {
                            // Verify password
                            if !self.info_manager.verify_password(&pwd) {
                                self.show_error(
                                    "Invalid Password",
                                    "The admin password is incorrect. Please try again.",
                                );
                            } else {
                                password = pwd;
                                current_step = 4;
                            }
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("Setup Required", "Admin password cannot be empty.");
                        }
                        NavigationResult::Back => {
                            current_step = 2;
                        }
                        NavigationResult::Cancel => {
                            std::process::exit(0);
                        }
                    }
                }
                4 => {
                    // Get or generate client ID
                    let client_id = if let Ok(existing_info) = self.info_manager.load_info() {
                        existing_info.client_id
                    } else {
                        uuid::Uuid::new_v4().to_string()
                    };

                    // Password verified, now request OTP from server
                    info!("📧 Requesting OTP from server...");
                    let otp_message = match self.request_otp_sync(
                        &client_id,
                        &employee_name,
                        &employee_id,
                    ) {
                        Ok(msg) => msg,
                        Err(e) => {
                            self.show_error("OTP Request Failed", &format!("Failed to request OTP from server.$([char]13)$([char]10)$([char]13)$([char]10)Error: {}$([char]13)$([char]10)$([char]13)$([char]10)You can go back to correct your information.", e));
                            current_step = 3;
                            continue;
                        }
                    };

                    self.show_info("OTP Sent", &otp_message);

                    // Step 4: Get OTP from user
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)  - Employee ID: {}$([char]13)$([char]10)  - Password: Verified$([char]13)$([char]10)$([char]13)$([char]10)", employee_name, employee_id);
                    let prompt = format!("{}Enter the OTP sent to admin email:", summary);

                    match self.prompt_input_with_navigation(
                        "Employee Setup - Step 4/4",
                        &prompt,
                        "",
                        true,
                    ) {
                        NavigationResult::Next(otp) if !otp.is_empty() => {
                            // Verify OTP with server
                            info!("🔐 Verifying OTP...");
                            match self.verify_otp_sync(&client_id, &otp) {
                                Ok(_) => {
                                    // OTP verified, save employee info
                                    match self
                                        .info_manager
                                        .update_info(employee_name.clone(), employee_id.clone())
                                    {
                                        Ok(info) => {
                                            self.show_success(
                                                "Setup Complete",
                                                &format!("Employee information saved successfully!$([char]13)$([char]10)$([char]13)$([char]10)Name: {}$([char]13)$([char]10)ID: {}", 
                                                        info.employee_name, info.employee_id)
                                            );

                                            *self.current_info.write() = Some(info.clone());

                                            // Trigger callback
                                            if let Some(callback) =
                                                self.on_info_updated.read().as_ref()
                                            {
                                                callback(info.clone());
                                            }

                                            return Ok(info);
                                        }
                                        Err(e) => {
                                            self.show_error("Setup Failed", &format!("Failed to save employee information.$([char]13)$([char]10)$([char]13)$([char]10)Error: {}", e));
                                            current_step = 3;
                                        }
                                    }
                                }
                                Err(e) => {
                                    self.show_error("OTP Verification Failed", &format!("{}$([char]13)$([char]10)$([char]13)$([char]10)You can go back to request a new OTP.", e));
                                    current_step = 3;
                                }
                            }
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("Setup Required", "OTP is required to complete setup.");
                        }
                        NavigationResult::Back => {
                            current_step = 3;
                        }
                        NavigationResult::Cancel => {
                            std::process::exit(0);
                        }
                    }
                }
                _ => unreachable!(),
            }
        }
    }

    /// Show settings dialog (update info)
    #[cfg(target_os = "windows")]
    pub fn show_settings_dialog(&self) -> Result<()> {
        info!("⚙️ Showing settings dialog");

        let current_info = self.current_info.read();
        let (current_name, current_id, client_id) = if let Some(info) = current_info.as_ref() {
            (
                info.employee_name.clone(),
                info.employee_id.clone(),
                info.client_id.clone(),
            )
        } else {
            (
                String::new(),
                String::new(),
                uuid::Uuid::new_v4().to_string(),
            )
        };
        drop(current_info);

        // Store answers for navigation
        let mut employee_name = current_name.clone();
        let mut employee_id = current_id.clone();
        let mut password = String::new();
        let mut current_step = 1;

        loop {
            match current_step {
                1 => {
                    // Step 1: Get new employee name
                    let prompt = format!(
                        "Enter your full name:$([char]13)$([char]10)$([char]13)$([char]10)Current value: {}$([char]13)$([char]10)$([char]13)$([char]10)Click [Yes] to continue (you can keep or change it on the next screen).",
                        employee_name
                    );

                    match self.prompt_input_with_navigation(
                        "Update Employee Information - Step 1/4",
                        &prompt,
                        &employee_name,
                        false,
                    ) {
                        NavigationResult::Next(name) if !name.trim().is_empty() => {
                            employee_name = name.trim().to_string();
                            current_step = 2;
                        }
                        NavigationResult::Next(_) => {
                            employee_name = current_name.clone();
                            current_step = 2;
                        }
                        NavigationResult::Back => {
                            self.show_info(
                                "First Step",
                                "This is the first step. Please enter your name to continue.",
                            );
                        }
                        NavigationResult::Cancel => {
                            return Ok(());
                        }
                    }
                }
                2 => {
                    // Step 2: Get new employee ID
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)$([char]13)$([char]10)", employee_name);
                    let prompt = format!(
                        "{}Enter your employee ID:$([char]13)$([char]10)$([char]13)$([char]10)Current value: {}$([char]13)$([char]10)$([char]13)$([char]10)Click [Yes] to continue (you can keep or change it on the next screen).",
                        summary, employee_id
                    );

                    match self.prompt_input_with_navigation(
                        "Update Employee Information - Step 2/4",
                        &prompt,
                        &employee_id,
                        true,
                    ) {
                        NavigationResult::Next(id) if !id.trim().is_empty() => {
                            employee_id = id.trim().to_string();
                            current_step = 3;
                        }
                        NavigationResult::Next(_) => {
                            employee_id = current_id.clone();
                            current_step = 3;
                        }
                        NavigationResult::Back => {
                            current_step = 1;
                        }
                        NavigationResult::Cancel => {
                            return Ok(());
                        }
                    }
                }
                3 => {
                    // Step 3: Get admin password and verify
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)  - Employee ID: {}$([char]13)$([char]10)$([char]13)$([char]10)", employee_name, employee_id);
                    let prompt = format!("{}Enter admin password:", summary);

                    match self.prompt_input_with_navigation(
                        "Update Employee Information - Step 3/4",
                        &prompt,
                        "",
                        true,
                    ) {
                        NavigationResult::Next(pwd) if !pwd.is_empty() => {
                            // Verify password
                            if !self.info_manager.verify_password(&pwd) {
                                self.show_error(
                                    "Invalid Password",
                                    "The admin password is incorrect. Please try again.",
                                );
                            } else {
                                password = pwd;
                                current_step = 4;
                            }
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("Password Required", "Admin password cannot be empty.");
                        }
                        NavigationResult::Back => {
                            current_step = 2;
                        }
                        NavigationResult::Cancel => {
                            return Ok(());
                        }
                    }
                }
                4 => {
                    // Password verified, now request OTP from server
                    info!("📧 Requesting OTP from server...");
                    let otp_message = match self.request_otp_sync(
                        &client_id,
                        &employee_name,
                        &employee_id,
                    ) {
                        Ok(msg) => msg,
                        Err(e) => {
                            self.show_error("OTP Request Failed", &format!("Failed to request OTP from server.$([char]13)$([char]10)$([char]13)$([char]10)Error: {}$([char]13)$([char]10)$([char]13)$([char]10)You can go back to correct your information.", e));
                            current_step = 3;
                            continue;
                        }
                    };

                    self.show_info("OTP Sent", &otp_message);

                    // Step 4: Get OTP from user
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)  - Employee ID: {}$([char]13)$([char]10)  - Password: Verified$([char]13)$([char]10)$([char]13)$([char]10)", employee_name, employee_id);
                    let prompt = format!("{}Enter the OTP sent to admin email:", summary);

                    match self.prompt_input_with_navigation(
                        "Update Employee Information - Step 4/4",
                        &prompt,
                        "",
                        true,
                    ) {
                        NavigationResult::Next(otp) if !otp.is_empty() => {
                            // Verify OTP with server
                            info!("🔐 Verifying OTP...");
                            match self.verify_otp_sync(&client_id, &otp) {
                                Ok(_) => {
                                    // OTP verified, save employee info
                                    match self
                                        .info_manager
                                        .update_info(employee_name.clone(), employee_id.clone())
                                    {
                                        Ok(info) => {
                                            self.show_success(
                                                "Update Complete",
                                                &format!("Employee information updated successfully!$([char]13)$([char]10)$([char]13)$([char]10)Name: {}$([char]13)$([char]10)ID: {}", 
                                                        info.employee_name, info.employee_id)
                                            );

                                            *self.current_info.write() = Some(info.clone());

                                            // Trigger callback
                                            if let Some(callback) =
                                                self.on_info_updated.read().as_ref()
                                            {
                                                callback(info.clone());
                                            }

                                            return Ok(());
                                        }
                                        Err(e) => {
                                            self.show_error("Update Failed", &format!("Failed to update employee information.$([char]13)$([char]10)$([char]13)$([char]10)Error: {}", e));
                                            current_step = 3;
                                        }
                                    }
                                }
                                Err(e) => {
                                    self.show_error("OTP Verification Failed", &format!("{}$([char]13)$([char]10)$([char]13)$([char]10)You can go back to request a new OTP.", e));
                                    current_step = 3;
                                }
                            }
                        }
                        NavigationResult::Next(_) => {
                            self.show_error(
                                "OTP Required",
                                "OTP is required to complete the update.",
                            );
                        }
                        NavigationResult::Back => {
                            current_step = 3;
                        }
                        NavigationResult::Cancel => {
                            return Ok(());
                        }
                    }
                }
                _ => unreachable!(),
            }
        }
    }

    /// Show about dialog
    #[cfg(target_os = "windows")]
    pub fn show_about_dialog(&self) {
        let current_info = self.current_info.read();
        let info_text = if let Some(info) = current_info.as_ref() {
            format!(
                "ScreenTime Monitoring Client\n\n\
                Employee: {}\n\
                ID: {}\n\
                Client ID: {}\n\n\
                Version: {}",
                info.employee_name,
                info.employee_id,
                info.client_id,
                env!("CARGO_PKG_VERSION")
            )
        } else {
            format!(
                "ScreenTime Monitoring Client\n\nVersion: {}\n\nNo employee information configured.",
                env!("CARGO_PKG_VERSION")
            )
        };

        self.show_message("about", "About ScreenTime Monitoring", &info_text);
    }

    /// Prompt for text input with navigation support (Back / Continue / Cancel).
    ///
    /// Renders a single, fully themed WPF window that matches the ScreenTime
    /// dashboard "mission-control" look (dark navy surface, electric-blue accent,
    /// Segoe UI, rounded corners, a step indicator) instead of the old stacked
    /// pair of native MessageBox + InputBox popups. The `message` may contain the
    /// legacy `$([char]13)$([char]10)` newline tokens or real newlines — both are
    /// normalized. All dynamic text is passed via environment variables so
    /// employee names / prompts can never break the script or be injected.
    #[cfg(target_os = "windows")]
    fn prompt_input_with_navigation(
        &self,
        title: &str,
        message: &str,
        default: &str,
        allow_back: bool,
    ) -> NavigationResult {
        // Split "Step X/Y" out of the title for the stepper chip if present.
        let (heading, step_label) = Self::split_step_title(title);
        let body = Self::ps_to_newline(message);

        let vars = [
            ("VS_KIND", "input"),
            ("VS_HEADING", heading.as_str()),
            ("VS_STEP", step_label.as_str()),
            ("VS_BODY", body.as_str()),
            ("VS_DEFAULT", default),
            ("VS_ALLOWBACK", if allow_back { "1" } else { "0" }),
            (
                "VS_PASSWORD",
                if Self::looks_like_password(&body) {
                    "1"
                } else {
                    "0"
                },
            ),
        ];

        let out = Self::run_themed_window(&vars);
        match out.as_deref() {
            Some(s) if s.starts_with("NEXT\u{1}") => {
                let value = s.trim_start_matches("NEXT\u{1}").trim_end().to_string();
                if value.is_empty() && !default.is_empty() {
                    NavigationResult::Next(default.to_string())
                } else {
                    NavigationResult::Next(value)
                }
            }
            Some(s) if s.trim() == "BACK" => NavigationResult::Back,
            _ => NavigationResult::Cancel,
        }
    }

    /// Pull a trailing "Step X/Y" (or "- Step X/Y") off a dialog title so it can
    /// be shown as a distinct stepper chip. Returns (heading, step_label).
    #[cfg(target_os = "windows")]
    fn split_step_title(title: &str) -> (String, String) {
        if let Some(idx) = title.rfind("Step ") {
            let (head, step) = title.split_at(idx);
            let head = head.trim().trim_end_matches('-').trim().to_string();
            (head, step.trim().to_string())
        } else {
            (title.to_string(), String::new())
        }
    }

    /// Heuristic: the admin-password step should mask input. We detect it from
    /// the prompt text so we don't have to thread an extra flag through the loop.
    #[cfg(target_os = "windows")]
    fn looks_like_password(body: &str) -> bool {
        let b = body.to_lowercase();
        b.contains("admin password") || b.contains("enter admin password")
    }

    /// Run the themed WPF dialog via a single STA PowerShell process. The XAML +
    /// controller script is embedded here; all variable content arrives through
    /// the environment (set on the child) so nothing is string-interpolated into
    /// the script. Returns the raw stdout line the script prints, or None on
    /// failure (treated as Cancel by callers).
    #[cfg(target_os = "windows")]
    fn run_themed_window(vars: &[(&str, &str)]) -> Option<String> {
        Self::run_themed_script(THEMED_DIALOG_SCRIPT, vars)
    }

    /// Run an arbitrary themed WPF PowerShell script in an STA process, passing
    /// all dynamic content via environment variables. Returns the trimmed stdout
    /// line the script prints, or None on failure/empty.
    #[cfg(target_os = "windows")]
    fn run_themed_script(script: &str, vars: &[(&str, &str)]) -> Option<String> {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-STA",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW);
        for (k, v) in vars {
            cmd.env(k, v);
        }
        let output = cmd.output().ok()?;
        let s = String::from_utf8_lossy(&output.stdout)
            .trim_end_matches(['\r', '\n'])
            .to_string();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }

    /// Show the themed tray context menu (a cursor-anchored WPF popup that
    /// matches the mission-control GUI, replacing the old native Win32 menu).
    /// Returns the chosen action id: "stats" | "settings" | "about" | "pause"
    /// | "resume" | "stop", or None if dismissed.
    #[cfg(target_os = "windows")]
    pub fn show_tray_menu(&self, is_paused: bool) -> Option<String> {
        let current = self.current_info.read();
        let subtitle = current
            .as_ref()
            .map(|i| format!("{} · {}", i.employee_name, i.employee_id))
            .unwrap_or_else(|| "Not configured".to_string());
        drop(current);

        let vars = [
            ("VS_PAUSED", if is_paused { "1" } else { "0" }),
            ("VS_SUBTITLE", subtitle.as_str()),
        ];
        Self::run_themed_script(THEMED_TRAY_MENU_SCRIPT, &vars)
    }

    /// Ask for a free-form explanation after a long idle period using the same
    /// themed WPF surface as setup and settings.
    #[cfg(target_os = "windows")]
    pub(crate) fn prompt_idle_reason(idle_minutes: u64) -> Option<String> {
        let body = format!(
            "You were idle for about {} minute{}.\nPlease briefly explain the reason (for example: lunch, a meeting, a call, or a break).",
            idle_minutes,
            if idle_minutes == 1 { "" } else { "s" }
        );
        let vars = [
            ("VS_KIND", "input"),
            ("VS_HEADING", "Idle time check-in"),
            ("VS_STEP", ""),
            ("VS_BODY", body.as_str()),
            ("VS_DEFAULT", ""),
            ("VS_ALLOWBACK", "0"),
            ("VS_PASSWORD", "0"),
            ("VS_PRIMARY_LABEL", "Submit reason"),
        ];

        let output = Self::run_themed_window(&vars)?;
        let raw = output.strip_prefix("NEXT\u{1}")?.trim();
        if raw.is_empty() {
            return None;
        }
        Some(raw.chars().take(255).collect())
    }

    /// Convert PowerShell newline syntax to actual newlines for rfd dialogs
    #[cfg(target_os = "windows")]
    fn ps_to_newline(text: &str) -> String {
        text.replace("$([char]13)$([char]10)", "\n")
    }

    /// Show a themed message window (matches the dashboard look). `kind` is one
    /// of "error" | "success" | "info" | "about" and drives the accent colour and
    /// icon glyph on the PowerShell side.
    #[cfg(target_os = "windows")]
    fn show_message(&self, kind: &str, title: &str, message: &str) {
        let body = Self::ps_to_newline(message);
        let vars = [
            ("VS_KIND", "message"),
            ("VS_LEVEL", kind),
            ("VS_HEADING", title),
            ("VS_STEP", ""),
            ("VS_BODY", body.as_str()),
        ];
        let _ = Self::run_themed_window(&vars);
    }

    /// Show error message
    #[cfg(target_os = "windows")]
    fn show_error(&self, title: &str, message: &str) {
        error!("❌ {}: {}", title, Self::ps_to_newline(message));
        self.show_message("error", title, message);
    }

    /// Show success message
    #[cfg(target_os = "windows")]
    fn show_success(&self, title: &str, message: &str) {
        info!("✅ {}: {}", title, Self::ps_to_newline(message));
        self.show_message("success", title, message);
    }

    /// Show info message
    #[cfg(target_os = "windows")]
    fn show_info(&self, title: &str, message: &str) {
        info!("ℹ️ {}: {}", title, Self::ps_to_newline(message));
        self.show_message("info", title, message);
    }

    /// Get current employee info
    pub fn get_current_info(&self) -> Option<EmployeeInfo> {
        self.current_info.read().clone()
    }
}

// Non-Windows stub implementations
#[cfg(not(target_os = "windows"))]
impl GuiState {
    pub fn show_setup_dialog(&self) -> Result<EmployeeInfo> {
        unimplemented!("GUI is only supported on Windows")
    }

    pub fn show_settings_dialog(&self) -> Result<()> {
        unimplemented!("GUI is only supported on Windows")
    }

    pub fn show_about_dialog(&self) {
        unimplemented!("GUI is only supported on Windows")
    }
}
