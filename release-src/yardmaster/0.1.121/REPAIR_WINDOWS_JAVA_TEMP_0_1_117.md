# Yardmaster 0.1.117 precision repair

Keep Windows emulator temporary files in an owner-specific subfolder of the standard Temp directory. Java 21 failed to connect its selector socket under Yardmaster app data; a real local Java selector probe reproduced the failure there and passed under Windows Temp. Storage remains isolated, and Linux retains the app-data runtime directory.

Verification: updated Storage isolation test, Windows owner-separation test, and affected desktop/Android closed-loop startup tests only. No full suite run by Codex. Version 0.1.116 handoff repair remains unchanged.
