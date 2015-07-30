#!/usr/bin/env node

/*
 * hw.js
 *
 * A homework toolkit for hackers 
 * Copyright (C) 2015 Alyssa Rosenzweig

 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * Electronic Mail Address:
 * alyssa.a.rosenzweig@gmail.com
 *
 */

var fs = require("fs");
var http = require("http");
var argv = require("minimist")(process.argv.slice(2));

var command = argv._[0];

var exec = require("child_process").exec;
var spawn = require("child_process").spawn;

var formats = require("./formats/index.js");

if(!command) {
    usage();
    process.exit(0);
}

// import configuration file conditionally

var config;

try {
    config = require(process.cwd() + "/config.js");
    main();
} catch(e) {
    // if this is init command, that's fine :)
    
    if(command != "init") {
        // alright, perhaps there is a default hw instance somewhere else,
        // and we can change dir there instead:
        
        function failMessage() {
            console.error("The configuration file could not be loaded.");
            console.error("Did you use `hw init` first?");
            console.error("If so, this is a bug. https://github.com/bobbybee/hw/issues/new");
            process.exit(1);
        }

        console.log("Searching "+process.env["HOME"]+"/.hw_default");

        fs.readFile(process.env["HOME"]+"/.hw_default", function(err, data) {
            if(err) {
                throw err;
                failMessage();
            }
            

            var n = data.toString().trim();

            // alright, let's change directories and try again
            try {
                process.chdir(n);
            } catch(e) {
                console.error(e);
                console.warn(process.cwd());
                failMessage();
            }

            try {
                config = require(process.cwd() + "/config.js");
                main();
            } catch(e) {
                // our options are exhausted at this point :(
                failMessage();
            }
        });
    }
}

function main() {
    if(command == "add") {
        addFile(argv._[argv._.length-1], argv["class"] || argv.c || "Class 8", argv.format || config.defaultFormat || "markdown"); 
    } else if(command == "note") {
        // note is a shorthand for adding a new file,
        // but is specifically for small assignments that need to *just work*
        // they're not meant to be printed or anything,
        // and are generally for using your computer as a 'dumb terminal' in class
        
        addFile("Notes on " + argv._[argv._.length-1], argv["class"] || argv.c || "", config.noteFormat || "markdown");
    } else if(command == "print") {
        print(argv._[argv._.length-1], argv.latest !== undefined, argv.pdf !== undefined);
    } else if(command == "init") {
        init();
    } else {
        usage();
    }
}

function init() {
    // initialize git and the status file
    exec("git init . && echo '{}' > status.json");

    // copy the template file and my config file
    
    fs.readFile(__dirname + "/template.html", function(err, data) {
        if(err) throw err;
        fs.writeFile("template.html", data);
    });
    
    fs.readFile(__dirname + "/config.js", function(err, data) {
        if(err) throw err;
    fs.writeFile("config.js", data);
});

    // setup the global pointer to this hw instance
    // this lets the user use hw from any directory,
    // abstracting away the ugly cd's
    
    fs.writeFile(process.env["HOME"] + "/.hw_default", process.cwd());
}

function getDescriptor(format) {
    var formatDescriptor = require("./formats/"+format); // NOTE: this is not a secure call,
                                                        // nor is it intended to be
                                                        // hw expects its input to be trusted
    
    if(!formatDescriptor) {
        throw new Error();
    }

    return formatDescriptor;    
}

function addFile(name, cls, format) {
    var formatDescriptor = getDescriptor(format); 
    
    var filename = name.replace(/ /g, "_")
                 + "." + formatDescriptor.extension;

    // call configuration function for location
    filename =  (
            config.getFileDirectory &&
            config.getFileDirectory(filename, name, cls, format)
    ) || filename;
   
    var defaultText = formatDescriptor.defaultText(name, cls);

    fs.writeFile(filename, defaultText, function() {
        // spawn an editor of the user's choice
        // hopefully that choice is vim ;)
        
        var editor = spawn(config.editor || "vim", [filename], {stdio: "inherit"});
        editor.on("exit", function() {
            // we should update the status file
            
            fs.readFile(process.cwd()+"/status.json", function(err, data) {
                if(err) throw err;
                var status = JSON.parse(data);
                
                status.latestHW = filename;

                fs.writeFile(process.cwd()+"/status.json", JSON.stringify(status));
            })

            // now we need to commit to git
            // if desired
           
            if(!config.useGit) return;

            exec("git add " + filename + " && git commit -m \"" + name.replace(/"/g, "") + "\"");
        });
    });
}

function getLatest(callback) {
    fs.readFile(process.cwd()+"/status.json", function(err, data) {
        if(err) throw err;

        callback(JSON.parse(data).latestHW);
    });
}

function inferFormat(filename) {
    var parts = filename.split(".");
    var ext = parts[parts.length - 1];

    return formats[ext];
}

function print(file, latest, pdf) {
    if(latest) {
        // instead of using a filename, find the most recent homework assignment
        return getLatest(function(f) {
            console.log("Printing "+f);
            print(f, false, pdf);
        });
    }

    var format = inferFormat(file);
    getDescriptor(format).print(file, pdf);
}

function usage() {
    [
        "usage: hw command [options]",
        "",
        "list of commands:",
        "add - creates a new file in the repository",
        "   hw add [--class=classname] [--format=markdown] Assignment_Title",
        "note - quick notetaking command",
        "   hw note [--class=classname] Subject",
        "print - prints an assignment. If --latest is used, filename is ignored.",
        "   hw print [--pdf] [--latest] filename",
        "init - initializes a repository for hw tracking",
        "   hw init"
    ].forEach(function(a) { console.log(a) });
}
