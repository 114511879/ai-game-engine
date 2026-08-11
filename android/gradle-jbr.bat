@echo off
setlocal

if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" goto run

set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if exist "%JAVA_HOME%\bin\java.exe" goto run

echo ERROR: Set JAVA_HOME to a valid JDK 11 installation or install Android Studio in Program Files. 1>&2
exit /b 1

:run
call "%~dp0gradlew.bat" %*
exit /b %ERRORLEVEL%
