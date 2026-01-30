| display_name             | category | subcategory     | input_units | display_units | conversion_formula                           | input_structure   | default_splits       |
| ------------------------ | -------- | --------------- | ----------- | ------------- | -------------------------------------------- | ----------------- | -------------------- |
| 5m_Accel                 | Speed    | Acceleration    | s           | s             |                                              | single_interval   |                      |
| 10m_Accel                | Speed    | Acceleration    | s           | s             |                                              | cumulative        | 5 \| 5               |
| 15m_Accel                | Speed    | Acceleration    | s           | s             |                                              | cumulative        | 5 \| 5 \| 5          |
| 20m_Accel                | Speed    | Acceleration    | s           | s             |                                              | cumulative        | 5 \| 5 \| 10         |
| 30m_Accel                | Speed    | Acceleration    | s           | s             |                                              | cumulative        | 10 \| 10 \| 10       |
| 5-10m_Split              | Speed    | Acceleration    | s           | mph           | velocity_mph = (distance_m / time_s) * 2.237 | single_interval   |                      |
| 5-15m_Split              | Speed    | Acceleration    | s           | mph           | velocity_mph = (distance_m / time_s) * 2.237 | single_interval   |                      |
| 10-20m_Split             | Speed    | Acceleration    | s           | mph           | velocity_mph = (distance_m / time_s) * 2.237 | single_interval   |                      |
| 20-30m_Split             | Speed    | Acceleration    | s           | mph           | velocity_mph = (distance_m / time_s) * 2.237 | single_interval   |                      |
| 10-30m_Split             | Speed    | Acceleration    | s           | mph           | velocity_mph = (distance_m / time_s) * 2.237 | single_interval   |                      |
| 40m_Sprint               | Speed    | MaxV            | s           | s             |                                              | cumulative        | 20 \| 10 \| 10       |
| 50m_Sprint               | Speed    | MaxV            | s           | s             |                                              | cumulative        | 30 \| 10 \| 10       |
| 30-40m_Split             | Speed    | MaxV            | s           | mph           | velocity_mph = (distance_m / time_s) * 2.237 | single_interval   |                      |
| 40-50m_Split             | Speed    | MaxV            | s           | mph           | velocity_mph = (distance_m / time_s) * 2.237 | single_interval   |                      |
| 10m_Light-Sled           | Speed    | Resisted        | s           | s             |                                              | single_interval   |                      |
| 10m_Medium-Sled          | Speed    | Resisted        | s           | s             |                                              | single_interval   |                      |
| 20m_Light-Sled           | Speed    | Resisted        | s           | s             |                                              | cumulative        | 10 \| 10             |
| 20m_Medium-Sled          | Speed    | Resisted        | s           | s             |                                              | cumulative        | 10 \| 10             |
| 10-20m_Light-Sled        | Speed    | Resisted        | s           | mph           | velocity_mph = (distance_m / time_s) * 2.237 | single_interval   |                      |
| 10-20m_Medium-Sled       | Speed    | Resisted        | s           | mph           | velocity_mph = (distance_m / time_s) * 2.237 | single_interval   |                      |
| 8-Step_Accel             | Speed    | Hurdles         | s           | s             |                                              | single_interval   |                      |
| 8-Step_Over-1H           | Speed    | Hurdles         | s           | s             |                                              | single_interval   |                      |
| Seated-Broad             | X-Factor | Horizontal Jump | cm          | ft            | distance_ft = distance_cm / 30.48            | single_interval   |                      |
| Standing-Broad           | X-Factor | Horizontal Jump | cm          | ft            | distance_ft = distance_cm / 30.48            | single_interval   |                      |
| MB-Broad                 | X-Factor | Horizontal Jump | cm          | ft            | distance_ft = distance_cm / 30.48            | single_interval   |                      |
| Triple-Broad             | X-Factor | Horizontal Jump | m           | ft            | distance_ft = distance_m / 3.281             | single_interval   |                      |
| Depth-Broad_8            | X-Factor | Horizontal Jump | cm          | ft            | distance_ft = distance_cm / 30.48            | single_interval   |                      |
| Depth-Broad_12           | X-Factor | Horizontal Jump | cm          | ft            | distance_ft = distance_cm / 30.48            | single_interval   |                      |
| Depth-Broad_18           | X-Factor | Horizontal Jump | cm          | ft            | distance_ft = distance_cm / 30.48            | single_interval   |                      |
| Standing-Triple          | X-Factor | Bound           | m           | ft            | distance_ft = distance_m / 3.281             | single_interval   |                      |
| 5-Bound                  | X-Factor | Bound           | m           | ft            | distance_ft = distance_m / 3.281             | single_interval   |                      |
| Vertical Jump            | X-Factor | Vertical Jump   | in          | in            |                                              | single_interval   |                      |
| Paused-Vertical          | X-Factor | Vertical Jump   | in          | in            |                                              | single_interval   |                      |
| Depth-Vertical_8         | X-Factor | Vertical Jump   | in          | in            |                                              | single_interval   |                      |
| Depth-Vertical_12        | X-Factor | Vertical Jump   | in          | in            |                                              | single_interval   |                      |
| Depth-Vertical_18        | X-Factor | Vertical Jump   | in          | in            |                                              | single_interval   |                      |
| Depth-Vertical_24        | X-Factor | Vertical Jump   | in          | in            |                                              | single_interval   |                      |
| 10-5_RSI                 | X-Factor | Vertical Jump   | RSI         | RSI           |                                              | single_interval   |                      |
| Hop-Test_RSI             | X-Factor | Vertical Jump   | RSI         | RSI           |                                              | single_interval   |                      |
| Depth-Pop-GCT_8          | X-Factor | Vertical Jump   | s           | s             |                                              | single_interval   |                      |
| Depth-Pop-GCT_12         | X-Factor | Vertical Jump   | s           | s             |                                              | single_interval   |                      |
| Depth-Pop-GCT_18         | X-Factor | Vertical Jump   | s           | s             |                                              | single_interval   |                      |
| DBWeight-Vertical_8s     | X-Factor | Vertical Jump   | in          | in            |                                              | single_interval   |                      |
| DBWeight-Vertical_10s    | X-Factor | Vertical Jump   | in          | in            |                                              | single_interval   |                      |
| HEXWeight-Vertical_55    | X-Factor | Vertical Jump   | in          | in            |                                              |                   |                      |
| HEXWeight-Vertical_95    | X-Factor | Vertical Jump   | in          | in            |                                              |                   |                      |
| Weight-Drop-Vertical_8s  | X-Factor | Vertical Jump   | in          | in            |                                              | single_interval   |                      |
| Weight-Drop-Vertical_10s | X-Factor | Vertical Jump   | in          | in            |                                              | single_interval   |                      |
| ISO-Force_Ankle-Dorsi    | X-Factor | ISO-Test        | N           | N             |                                              | paired_components | L \| R               |
| ISO-Force_Adduct         | X-Factor | ISO-Test        | N           | N             |                                              | paired_components | L \| R               |
| ISO-Force_Ham-Hip        | X-Factor | ISO-Test        | N           | N             |                                              | paired_components | L \| R               |
| ISO-Force_Ham-Curl       | X-Factor | ISO-Test        | N           | N             |                                              | paired_components | L \| R               |
| OH-MB_Throw              | X-Factor | Throw           | m           | ft            | distance_ft = distance_m / 3.281             | single_interval   |                      |
| UH-MB_Throw              | X-Factor | Throw           | m           | ft            | distance_ft = distance_m / 3.281             | single_interval   |                      |
| Plyo-Pushup_Height       | X-Factor | Misc            | in          | in            |                                              | single_interval   |                      |
| 24/28s_Drill             | Lactic   | Sprints         | m           | m             |                                              | single_interval   |                      |
| 24/28_200m               | Lactic   | Sprints         | s           | s             |                                              | cumulative        | 50 \| 50 \| 50 \| 50 |
| 3x200m                   | Lactic   | Sprints         | s           | s             |                                              | cumulative        | 60 \| 40 \| 100      |
| 3x200m_Predict           | Lactic   | Sprints         | s           | s             |                                              | single_interval   |                      |
| 3x150m                   | Lactic   | Sprints         | s           | s             |                                              | cumulative        | 60 \| 40 \| 50       |
| 3x150m_Predict           | Lactic   | Sprints         | s           | s             |                                              | single_interval   |                      |
| Kosmin-800_Rep           | Lactic   | Distance        | m           | m             |                                              | single_interval   |                      |
| Kosmin-800_Sum           | Lactic   | Distance        | m           | m             |                                              | single_interval   |                      |
| Kosmin-1500_Rep          | Lactic   | Distance        | m           | m             |                                              | single_interval   |                      |
| Kosmin-1500_Sum          | Lactic   | Distance        | m           | m             |                                              | single_interval   |                      |
| Kosmin-800_Rep-Time      | Lactic   | Distance        | s           | s             |                                              | single_interval   |                      |
| Kosmin-800_Sum-Time      | Lactic   | Distance        | s           | s             |                                              | single_interval   |                      |
| Kosmin-1500_Rep-Time     | Lactic   | Distance        | s           | s             |                                              | single_interval   |                      |
| Kosmin-1500_Sum-Time     | Lactic   | Distance        | s           | s             |                                              | single_interval   |                      |