# Consumer rules for nutrivision-vision: applied to any app that depends on
# this module, so the host app's R8 pass cannot break the MediaPipe Tasks
# library it links. (The tasks-vision AAR ships no consumer rules of its own.)
#
# Symptom without these, on the first R8 release build:
#   Call to function 'NutriVisionVision.analyzePhoto' has been rejected.
#   Caused by: java.lang.RuntimeException: Field platform_ for L8.u not found.
# MediaPipe's option/result messages are protobuf-javalite classes whose
# fields are located by name at runtime from a generated descriptor string;
# R8 renames the fields and the lookup fails.

# protobuf-javalite: keep every generated message intact (fields, oneofs, the
# newMessageInfo descriptor), plus the runtime that reads them.
-keep class * extends com.google.protobuf.GeneratedMessageLite { *; }
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.protobuf.**

# MediaPipe Tasks: reached from JNI (libmediapipe_tasks_vision_jni.so) by
# name — keep the Java side as shipped.
-keep class com.google.mediapipe.** { *; }
-dontwarn com.google.mediapipe.**

# AutoValue-generated result/option classes MediaPipe uses.
-keep class com.google.auto.value.** { *; }
-dontwarn com.google.auto.value.**

# This module's own classes are invoked from JS by name through Expo Modules;
# keep the public surface so a future rename in R8 cannot silently detach it.
-keep class com.nutrivision.vision.** { *; }
