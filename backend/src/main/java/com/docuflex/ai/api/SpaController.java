package com.docuflex.ai.api;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * Controller to handle Single Page Application (SPA) routing.
 * Forwards all non-API and non-static resource requests to index.html
 * so that React Router can handle them.
 */
@Controller
public class SpaController {

    @RequestMapping(value = {
        "/",
        "/{path:[^\\.]*}",
        "/**/{path:[^\\.]*}"
    }, produces = "text/html")
    public String forward() {
        return "forward:/index.html";
    }
}
