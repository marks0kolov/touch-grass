#!/usr/bin/env python3

import sys
import os
import numpy as np
import cv2
import onnxruntime as rt
from yaspin import yaspin
from yaspin.spinners import Spinners
from rich import print

# check the amount of arguemnts:
if len(sys.argv) != 4:
    print(f"[bold red]Error:[/] Incorrect usage. Please use {sys.argv[0]} model.onnx image_or_folder labels.txt")
    sys.exit(1)

model_path, path, labels_path = sys.argv[1], sys.argv[2], sys.argv[3] # get arguments

# get image(s) paths:
if os.path.isdir(path):
    files = os.listdir(path)
    jpgs = [f for f in files if f.lower().endswith('.jpg')]
    if len(jpgs) != len(files): # raise error if the dir doesn't only contain jpg images
        print("[bold red]Error: Folder must contain only .jpg images")
        sys.exit(1)
    image_paths = [os.path.join(path, f) for f in jpgs]
else:
    image_paths = [path]

# load model (prefer TensorRT/CUDA if available, fall back to CPU):
avail = rt.get_available_providers()
providers = [p for p in ('TensorrtExecutionProvider','CUDAExecutionProvider') if p in avail]
providers.append('CPUExecutionProvider')
sess = rt.InferenceSession(model_path, providers=providers)

# read models expected image size:
inp = sess.get_inputs()[0]
h, w = inp.shape[2] or 224, inp.shape[3] or 224

# create normalization values for image colors:
mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# read labels:
with open(labels_path) as f:
    labels = [l.strip() for l in f]

with yaspin(Spinners.dots6, text="Processing...") as spinner: # using yaspin for processing animation
    try:
        for img_path in image_paths:
            spinner.text = f"Processing {os.path.basename(img_path)}"
            img = cv2.imread(img_path) # load JPG into numpy array
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB) # convert BGR → RGB
            img = cv2.resize(img, (w, h)).astype(np.float32) / 255.0  # resize & scale to [0,1]
            img = (img - mean) / std # normalize channels
            img = np.transpose(img, (2, 0, 1))[None, ...]

            outputs = sess.run(None, {inp.name: img}) # run model
            probs = outputs[0][0] # extract probability vector
            idx = int(np.argmax(probs)) # get highest‐prob index
            conf = probs[idx] * 100 # get confidence

            spinner.write(f"{os.path.basename(img_path)} -> {labels[idx]} {conf:.2f}%") # output result
        spinner.text = f"Processed {len(image_paths)} images" if len(image_paths) != 1 else f"Processed {len(image_paths)} image" # print success info
        spinner.ok('✔')
    except Exception as e:
        spinner.fail("✖")
        print(f"[bold red]Error:[/] {e}") # print error info