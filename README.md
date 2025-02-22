# speckle-webapp-v2
Speckle Interactive Urbanism

this projects builds upon the MassOnSpeed from speckle hackatron (https://github.com/AlpachinoOA/MassOnSpeed)

This is an interactive viewer for simple masses overlayed on a speckle 3d model.
This uses a speckle 3d model of an urban setting.
It gets the webcam and detects any qr code form the webcam.
The size and position of the qr code corresponds to a rectngle in the 3d model in the ar-code layer.
(the position is top left corner in 0,0 and it goes on x and -y axes)
(size of the qr codeis a variable in the script)
the size of the urban plan is another rectangle in the 3d model in the ar-rectangle layer.
(size of rectangle with width and height are variables in the script)
the image form the webcam can be an online whiteboard or a printed plan with coloured pieces of paper.

capture&overlay will detect boundaries of the colours and transform them into 3d models and overlays them ontop the speckle model.

settings pane can set colours and height of colours.

licence is MIT 